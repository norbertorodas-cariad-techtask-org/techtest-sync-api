const env = process.env;

const config = {
  github: { /* don't expose password or any sensitive info, done only for PoC */
    host: 'https://api.github.com/',
    token: env.GITHUB_TOKEN || 'testvalue',
    acceptHeader: 'application/vnd.github.v3+json'
  },
  artifactory: {
      host: 'https://nrodas.jfrog.io/artifactory/api/',
      apiKey: env.GITHUB_TOKEN || 'testvalue',
      authHeader: 'X-JFrog-Art-Api'
  }
};

module.exports = config;
