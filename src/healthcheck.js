import db from './services/db.js';

try {
    const rows = await db.query('SELECT 1 AS ok');

    if (rows[0]?.ok !== 1) {
        throw new Error('Database health check returned an unexpected result.');
    }

    console.log('Database connection is healthy.');
}
catch (error) {
    console.error('Database health check failed:', error.message);
    process.exitCode = 1;
}
finally {
    await db.close().catch(() => null);
}
