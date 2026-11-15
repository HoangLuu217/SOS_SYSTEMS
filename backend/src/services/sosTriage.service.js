const { SosRequest, HazardReport, WeatherArticle, AdministrativeArea } = require('../models');
const geminiService = require('./gemini.service');
const { emitSosUpdated } = require('../socket');
const crypto = require('crypto');

const TRIAGE_MODEL_VERSION = 'gemini-ai-triage-v1';

function createTriageInputHash(sos = {}) {
  const imageHashes = (Array.isArray(sos.images) ? sos.images : []).map((image) =>
    crypto.createHash('sha256').update(String(image || '')).digest('hex')
  );
  const normalized = {
    location: sos.location?.coordinates || [],
    areaId: String(sos.areaId?._id || sos.areaId || ''),
    address: String(sos.address || '').trim(),
    emergencyType: String(sos.emergencyType || ''),
    emergencyTypes: Array.isArray(sos.emergencyTypes) ? sos.emergencyTypes : [],
    people: Number(sos.people) || 1,
    description: String(sos.description || '').trim(),
    priorityGroups: Array.isArray(sos.priorityGroups) ? sos.priorityGroups : [],
    images: imageHashes,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function haversineMeters(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2) return Infinity;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  if ([lng1, lat1, lng2, lat2].some((v) => !Number.isFinite(Number(v)))) return Infinity;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Return factual nearby context only; no weighted severity or risk score is calculated here. */
async function collectTriageContext({ location, areaId, excludeSosId = null }) {
  const coords = location?.coordinates;
  const hasCoords = Array.isArray(coords) && coords.length === 2 && coords.every((v) => Number.isFinite(Number(v)));
  const context = { nearbyHazards: [], nearbySosCount: 0, weatherAlerts: [] };
  if (HazardReport.db?.readyState !== 1) return context;

  if (hasCoords) {
    try {
      const hazards = await HazardReport.find({
        status: 'APPROVED',
        location: { $near: { $geometry: { type: 'Point', coordinates: coords }, $maxDistance: 1800 } },
      }).select('title hazardType severity location address').limit(100).lean();
      context.nearbyHazards = hazards
        .map((hazard) => ({
          id: String(hazard._id),
          title: hazard.title,
          hazardType: hazard.hazardType,
          severity: hazard.severity,
          distanceMeters: Math.round(haversineMeters(coords, hazard.location?.coordinates)),
        }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 5);

      const sosFilter = {
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        location: { $near: { $geometry: { type: 'Point', coordinates: coords }, $maxDistance: 800 } },
      };
      if (excludeSosId) sosFilter._id = { $ne: excludeSosId };
      const nearbySos = await SosRequest.find(sosFilter).select('location').limit(100).lean();
      context.nearbySosCount = nearbySos.filter((item) => haversineMeters(coords, item.location?.coordinates) <= 800).length;
    } catch (error) {
      console.warn('[SosTriage] Nearby context warning:', error?.message || error);
    }
  }

  try {
    let areaName = '';
    if (areaId) {
      const area = await AdministrativeArea.findById(areaId).select('name').lean();
      areaName = String(area?.name || '').replace(/^(phường|xã|quận|huyện|thành phố|tp\.?)\s+/i, '').trim();
    }
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const articles = await WeatherArticle.find({
      status: { $in: ['approved', 'ACTIVE'] },
      $or: [{ published_at: { $gte: since } }, { created_at: { $gte: since } }],
    }).select('title regions category published_at created_at').sort({ published_at: -1, created_at: -1 }).limit(20).lean();
    context.weatherAlerts = articles
      .filter((article) => {
        if (!areaName) return false;
        const area = areaName.toLowerCase();
        return String(article.title || '').toLowerCase().includes(area) ||
          (Array.isArray(article.regions) && article.regions.some((region) => String(region).toLowerCase().includes(area)));
      })
      .slice(0, 5)
      .map(({ title, regions, category, published_at, created_at }) => ({ title, regions, category, publishedAt: published_at || created_at }));
  } catch (error) {
    console.warn('[SosTriage] Weather context warning:', error?.message || error);
  }
  return context;
}

async function buildTriageInput(sos, options = {}) {
  return {
    modelVersion: TRIAGE_MODEL_VERSION,
    inputHash: createTriageInputHash(sos),
    context: await collectTriageContext({
      location: sos.location,
      areaId: sos.areaId,
      excludeSosId: options.excludeSosId || sos._id || null,
    }),
  };
}

async function runAiTriageNow(sosId, { emitSocket = true } = {}) {
  try {
    const sos = await SosRequest.findById(sosId);
    if (!sos) return null;
    const triage = await buildTriageInput(sos.toObject(), { excludeSosId: sos._id });
    const priorityLockFilter = sos.priorityLockedByAuthority ? true : { $ne: true };
    const sourceFilter = sos.riskAssessment?.modelVersion === TRIAGE_MODEL_VERSION
      ? {
          _id: sosId,
          'riskAssessment.inputHash': triage.inputHash,
          priorityLockedByAuthority: priorityLockFilter,
          'riskAssessment.verifiedAt': sos.riskAssessment?.verifiedAt || null,
        }
      : {
          _id: sosId,
          ...(sos.updatedAt ? { updatedAt: new Date(sos.updatedAt) } : {}),
          ...(sos.status ? { status: sos.status } : {}),
          priorityLockedByAuthority: priorityLockFilter,
        };

    if (!geminiService.isConfigured()) {
      await SosRequest.updateOne(sourceFilter, {
        $set: {
          'aiAssessment.status': 'UNAVAILABLE',
          'aiAssessment.analyzedAt': new Date(),
          'riskAssessment.status': 'NEEDS_HUMAN_REVIEW',
          'riskAssessment.needsHumanReview': true,
          ...(!sos.priorityLockedByAuthority ? { priority: 'UNASSESSED' } : {}),
        },
        $unset: { riskScore: 1, riskBreakdown: 1 },
      });
      return null;
    }

    const aiResult = await geminiService.analyzeSosDanger({ sos: sos.toObject(), spatialContext: triage.context });
    if (!aiResult) {
      await SosRequest.updateOne(sourceFilter, {
        $set: {
          'aiAssessment.status': 'FAILED',
          'aiAssessment.analyzedAt': new Date(),
          'riskAssessment.status': 'NEEDS_HUMAN_REVIEW',
          'riskAssessment.needsHumanReview': true,
          ...(!sos.priorityLockedByAuthority ? { priority: 'UNASSESSED' } : {}),
        },
        $unset: { riskScore: 1, riskBreakdown: 1 },
      });
      return null;
    }

    const now = new Date();
    const updateSet = {
      riskAssessment: {
        status: 'COMPLETED',
        modelVersion: triage.modelVersion,
        inputHash: triage.inputHash,
        evaluatedAt: now,
        source: 'AI',
        suggestedPriority: aiResult.recommendedPriority,
        reasons: aiResult.reasons,
        extractedSignals: aiResult.extractedSignals,
        evidence: aiResult.evidence,
        unknowns: aiResult.unknowns,
        operationalNeeds: aiResult.operationalNeeds,
        needsHumanReview: true,
        verifiedPriority: sos.riskAssessment?.verifiedPriority || null,
        verifiedBy: sos.riskAssessment?.verifiedBy || null,
        verifiedAt: sos.riskAssessment?.verifiedAt || null,
        verificationNote: sos.riskAssessment?.verificationNote || null,
        priorityOutdatedByNewInfo: Boolean(sos.priorityLockedByAuthority),
      },
      aiAssessment: {
        status: 'COMPLETED',
        model: aiResult.model,
        analyzedAt: now,
        recommendedPriority: aiResult.recommendedPriority,
        confidence: aiResult.confidence,
        reasons: aiResult.reasons,
        extractedSignals: aiResult.extractedSignals,
        evidence: aiResult.evidence,
        unknowns: aiResult.unknowns,
        operationalNeeds: aiResult.operationalNeeds,
      },
    };
    if (!sos.priorityLockedByAuthority) updateSet.priority = aiResult.recommendedPriority;

    const writeResult = await SosRequest.updateOne(sourceFilter, {
      $set: updateSet,
      $unset: { riskScore: 1, riskBreakdown: 1 },
    });
    if (writeResult.matchedCount === 0) return null;
    const populated = await SosRequest.findById(sosId)
      .populate('citizenId', 'fullName phone avatarUrl email address citizenProfile roles')
      .populate('areaId', 'name code');
    if (emitSocket && populated) emitSosUpdated(populated);
    return populated;
  } catch (error) {
    console.warn('[SosTriage] AI triage error:', error?.message || error);
    return null;
  }
}

function scheduleAiTriage(sosId, options = {}) {
  setImmediate(() => runAiTriageNow(sosId, options).catch(() => {}));
}

module.exports = {
  TRIAGE_MODEL_VERSION,
  createTriageInputHash,
  collectTriageContext,
  buildTriageInput,
  runAiTriageNow,
  scheduleAiTriage,
};
