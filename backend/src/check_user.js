const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://hoangluu2172k4_db_user:EECVQ32MVqL9mF35@cluster0.ndahmq4.mongodb.net/sos_systems?retryWrites=true&w=majority';

async function check() {
  await mongoose.connect(MONGODB_URI);
  const users = await User.find({
    $or: [{ phone: /0778956030/ }, { email: /phuc/i }, { phone: /0905114118/ }],
  });
  console.log(
    'Users:',
    users.map((u) => ({
      id: u._id,
      fullName: u.fullName,
      phone: u.phone,
      email: u.email,
      hasPassword: !!u.passwordHash,
      googleId: !!u.googleId,
      roles: u.roles,
    }))
  );
  process.exit(0);
}

check().catch(console.error);

