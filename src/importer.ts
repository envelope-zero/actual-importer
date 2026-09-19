require ('dotenv').config()

let api = require('@actual-app/api');

(async () => {
  await api.init({
    dataDir: 'data',
    serverURL: process.env.SERVER_URL,
    password: process.env.SERVER_PASSWORD,
  });

  let serverVersion = await api.getServerVersion()

  console.log(`Server version is ${serverVersion.version}`)

  await api.shutdown();
})();
