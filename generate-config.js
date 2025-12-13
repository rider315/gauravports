// generate-config.js
const fs = require('fs');

const config = `// Auto-generated configuration file
window.CONTENTFUL_CONFIG = {
  SPACE_ID: "${process.env.CONTENTFUL_SPACE_ID || ''}",
  ACCESS_TOKEN: "${process.env.CONTENTFUL_ACCESS_TOKEN || ''}",
  ENVIRONMENT: "${process.env.CONTENTFUL_ENVIRONMENT || 'master'}"
};
`;

// Create assets/js directory if it doesn't exist
const dir = './assets/js';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync('./assets/js/contentful-config.js', config);
console.log('✅ Contentful config generated successfully!');
