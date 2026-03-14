const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'config/.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../config/.env')
];

const envPath = candidatePaths.find((candidatePath, index) => (
    candidatePaths.indexOf(candidatePath) === index && fs.existsSync(candidatePath)
));

if (envPath) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

module.exports = envPath;
