const User = require('./User');
const AuthorityOrganization = require('./AuthorityOrganization');
const AdministrativeArea = require('./AdministrativeArea');
const RescueTeam = require('./RescueTeam');
const Vehicle = require('./Vehicle');
const SosRequest = require('./SosRequest');
const SosAssignment = require('./SosAssignment');
const SosStatusHistory = require('./SosStatusHistory');
const SafeLocation = require('./SafeLocation');
const Notification = require('./Notification');
const File = require('./File');
const AuditLog = require('./AuditLog');
const HazardReport = require('./HazardReport');
const ChatMessage = require('./ChatMessage');
const WeatherArticle = require('./WeatherArticle');
const WeatherNotification = WeatherArticle;

module.exports = {
  User,
  AuthorityOrganization,
  AdministrativeArea,
  RescueTeam,
  Vehicle,
  SosRequest,
  SosAssignment,
  SosStatusHistory,
  SafeLocation,
  Notification,
  File,
  AuditLog,
  HazardReport,
  ChatMessage,
  WeatherArticle,
  WeatherNotification,
  weather_article: WeatherArticle,
};

