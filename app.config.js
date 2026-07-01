const baseConfig = require('./app.json');

const baseBuildNumber = Number(
  baseConfig.expo.extra?.appBuildNumber ||
  baseConfig.expo.android?.versionCode ||
  1
);

const buildNumber = Number(
  process.env.APP_BUILD_NUMBER ||
  process.env.GITHUB_RUN_NUMBER ||
  baseBuildNumber
);

module.exports = {
  ...baseConfig.expo,

  owner: 'darpan140601',

  android: {
    ...baseConfig.expo.android,
    versionCode: buildNumber,
  },

  extra: {
    ...baseConfig.expo.extra,
    appBuildNumber: String(buildNumber),
    eas: {
      ...baseConfig.expo.extra?.eas,
      projectId: '16c14549-bdcc-498c-820a-7e2c8ec3f2cf',
    },
  },
};