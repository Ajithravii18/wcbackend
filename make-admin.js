const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/kurukshthra';

console.log(`Connecting to database: ${mongoUri}...`);

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('Connected successfully!');
    const User = require('./models/User');

    const users = await User.find({}, 'name email role');
    if (users.length === 0) {
      console.log('No users found in the database. Please register a user first on the website!');
      rl.close();
      process.exit(0);
    }

    console.log('\nExisting Users:');
    users.forEach((u, i) => {
      console.log(`${i + 1}. Name: ${u.name} | Email: ${u.email} | Role: ${u.role}`);
    });

    rl.question('\nEnter the email of the user to make Admin: ', async (email) => {
      const trimmedEmail = email.trim().toLowerCase();
      const user = await User.findOne({ email: trimmedEmail });

      if (!user) {
        console.log(`\nError: User with email "${trimmedEmail}" not found.`);
      } else {
        user.role = 'admin';
        // Skip hashing password again when saving
        if (user.$locals) {
          user.$locals.skipHash = true;
        }
        await user.save();
        console.log(`\nSuccess! User "${user.name}" (${user.email}) is now an Admin.`);
      }
      rl.close();
      process.exit(0);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    rl.close();
    process.exit(1);
  });
