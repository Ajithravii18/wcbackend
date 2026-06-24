const mongoose = require('mongoose');
const User = require('./models/User');
async function run() {
  const conn = await mongoose.createConnection('mongodb://localhost:27017/admin').asPromise();
  const admin = conn.db.admin();
  const list = await admin.listDatabases();
  for (const dbInfo of list.databases) {
    const dbConn = await mongoose.createConnection(`mongodb://localhost:27017/${dbInfo.name}`).asPromise();
    const UserMod = dbConn.model('User', User.schema);
    const users = await UserMod.find({});
    const names = users.map(u => u.name);
    if (names.includes('AJITH KUMAR R') || names.includes('Ajith Kumar R')) {
      console.log(`Found in DB: ${dbInfo.name}`);
    }
    await dbConn.close();
  }
  process.exit(0);
}
run().catch(console.error);
