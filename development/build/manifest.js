const { promises: fs } = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { mergeWith, cloneDeep, capitalize } = require('lodash');

const baseManifest = process.env.ENABLE_MV3
  ? require('../../app/manifest/v3/_base.json')
  : require('../../app/manifest/v2/_base.json');
const { BuildType } = require('../lib/build-type');

const { TASKS, ENVIRONMENT } = require('./constants');
const { createTask, composeSeries } = require('./task');
const { getEnvironment } = require('./utils');

module.exports = createManifestTasks;

function createManifestTasks({
  browserPlatforms,
  browserVersionMap,
  buildType,
  applyLavaMoat,
  shouldIncludeSnow,
  entryTask,
}) {
  // merge base manifest with per-platform manifests
  const prepPlatforms = async () => {
    return Promise.all(
      browserPlatforms.map(async (platform) => {
        const platformModifications = await readJson(
          path.join(
            __dirname,
            '..',
            '..',
            'app',
            process.env.ENABLE_MV3 ? 'manifest/v3' : 'manifest/v2',
            `${platform}.json`,
          ),
        );
        const result = mergeWith(
          cloneDeep(baseManifest),
          platformModifications,
          browserVersionMap[platform],
          await getBuildModifications(buildType, platform),
          customArrayMerge,
        );

        modifyNameAndDescForNonProd(result);

        const dir = path.join('.', 'dist', platform);
        await fs.mkdir(dir, { recursive: true });
        await writeJson(result, path.join(dir, 'manifest.json'));
      }),
    );
  };

  // dev: add perms
  const envDev = createTaskForModifyManifestForEnvironment((manifest) => {
    manifest.permissions = [...manifest.permissions, 'webRequestBlocking'];
  });

  // testDev: add perms
  const envTestDev = createTaskForModifyManifestForEnvironment((manifest) => {
    manifest.permissions = [
      ...manifest.permissions,
      'webRequestBlocking',
      'http://localhost/*',
    ];
  });

  // test: add permissions
  const envTest = createTaskForModifyManifestForEnvironment((manifest) => {
    manifest.permissions = [
      ...manifest.permissions,
      'webRequestBlocking',
      'http://localhost/*',
    ];
  });

  // high level manifest tasks
  const dev = createTask(
    TASKS.MANIFEST_DEV,
    composeSeries(prepPlatforms, envDev),
  );

  const testDev = createTask(
    TASKS.MANIFEST_TEST_DEV,
    composeSeries(prepPlatforms, envTestDev),
  );

  const test = createTask(
    TASKS.MANIFEST_TEST,
    composeSeries(prepPlatforms, envTest),
  );

  const prod = createTask(TASKS.MANIFEST_PROD, prepPlatforms);

  return { prod, dev, testDev, test };

  // helper for modifying each platform's manifest.json in place
  function createTaskForModifyManifestForEnvironment(transformFn) {
    return () => {
      return Promise.all(
        browserPlatforms.map(async (platform) => {
          const manifestPath = path.join(
            '.',
            'dist',
            platform,
            'manifest.json',
          );
          const manifest = await readJson(manifestPath);
          transformFn(manifest);

          await writeJson(manifest, manifestPath);
        }),
      );
    };
  }

  // For non-production builds only, modify the extension's name and description
  function modifyNameAndDescForNonProd(manifest) {
    const environment = getEnvironment({ buildTarget: entryTask });

    if (environment === ENVIRONMENT.PRODUCTION) {
      return;
    }

    const mv3Str = process.env.ENABLE_MV3 ? ' MV3' : '';
    const lavamoatStr = applyLavaMoat ? ' lavamoat' : '';
    const snowStr = shouldIncludeSnow ? ' snow' : '';

    // Get the first 8 characters of the git revision id
    const gitRevisionStr = childProcess
      .execSync('git rev-parse HEAD')
      .toString()
      .trim()
      .substring(0, 8);

    manifest.name = `MetaMask ${capitalize(
      buildType,
    )}${mv3Str}${lavamoatStr}${snowStr}`;

    manifest.description = `${environment} build from git id: ${gitRevisionStr}`;
  }

  // helper for merging obj value
  function customArrayMerge(objValue, srcValue) {
    if (Array.isArray(objValue)) {
      return [...new Set([...objValue, ...srcValue])];
    }
    return undefined;
  }
}

// helper for reading and deserializing json from fs
async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

// helper for serializing and writing json to fs
async function writeJson(obj, file) {
  return fs.writeFile(file, JSON.stringify(obj, null, 2));
}

/**
 * Get manifest modifications for the given build type, including modifications specific to the
 * given platform.
 *
 * @param {BuildType} buildType - The build type.
 * @param {string} platform - The platform (i.e. the browser).
 * @returns {object} The build modificantions for the given build type and platform.
 */
async function getBuildModifications(buildType, platform) {
  if (!Object.values(BuildType).includes(buildType)) {
    throw new Error(`Invalid build type: ${buildType}`);
  } else if (buildType === BuildType.main) {
    return {};
  }

  const builtTypeManifestDirectoryPath = path.resolve(
    __dirname,
    '..',
    '..',
    'app',
    'build-types',
    buildType,
    'manifest',
  );

  const baseBuildTypeModificationsPath = path.join(
    builtTypeManifestDirectoryPath,
    '_base.json',
  );
  const buildModifications = await readJson(baseBuildTypeModificationsPath);

  const platformBuildTypeModificationsPath = path.join(
    builtTypeManifestDirectoryPath,
    `${platform}.json`,
  );
  try {
    const platformBuildTypeModifications = await readJson(
      platformBuildTypeModificationsPath,
    );
    Object.assign(buildModifications, platformBuildTypeModifications);
  } catch (error) {
    // Suppress 'ENOENT' error because it indicates there are no platform-specific manifest
    // modifications for this build type.
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return buildModifications;
}
