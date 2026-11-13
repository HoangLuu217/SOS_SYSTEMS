const mongoose = require('mongoose');
require('dotenv').config({ path: 'backend/.env' });

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const { SosRequest, ChatMessage } = require('./backend/src/models');
  const sos = await SosRequest.findOne({ sosCode: 'SOS-RJJN' });
  console.log('SOS-RJJN in DB:', sos ? { _id: sos._id, sosCode: sos.sosCode, status: sos.status } : 'Not found');
  const msgs = await ChatMessage.find({
    $or: [
      { 'sosData.sosCode': 'SOS-RJJN' },
      { content: /SOS-RJJN/ }
    ]
  });
  console.log('Chat messages for SOS-RJJN:', msgs.map(m => ({
    _id: m._id,
    contentSnippet: m.content?.slice(0, 100),
    sosDataStatus: m.sosData?.status
  })));
  await mongoose.disconnect();
})();

