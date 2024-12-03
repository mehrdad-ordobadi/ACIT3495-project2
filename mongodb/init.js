db = db.getSiblingDB('admin');

// Check if root user exists before creating
const rootUser = db.getUser("root");
if (!rootUser) {
    db.createUser({
        user: "root",
        pwd: process.env.MONGO_INITDB_ROOT_PASSWORD,
        roles: [ "root" ]
    });
}

db = db.getSiblingDB('analyticsdb');

// Create analytics collection if it doesn't exist
if (!db.getCollectionNames().includes('analytics')) {
    db.createCollection('analytics');
}

// Check if reader user exists before creating
const readerUser = db.getUser(process.env.MONGO_USER_READER);
if (!readerUser) {
    db.createUser({
        user: process.env.MONGO_USER_READER,
        pwd: process.env.MONGO_PASSWORD_READER,
        roles: [{ role: 'read', db: 'analyticsdb' }]
    });
}

// Check if writer user exists before creating
const writerUser = db.getUser(process.env.MONGO_USER_WRITER);
if (!writerUser) {
    db.createUser({
        user: process.env.MONGO_USER_WRITER,
        pwd: process.env.MONGO_PASSWORD_WRITER,
        roles: [{ role: 'readWrite', db: 'analyticsdb' }]
    });
}

// Create indexes
db.analytics.createIndex({ userid: 1 });
db.analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 86400 });

print("MongoDB initialization completed successfully");