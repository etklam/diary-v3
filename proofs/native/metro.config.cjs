/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module, __dirname */

const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const repositoryRoot = path.resolve(projectRoot, '../..')
const config = getDefaultConfig(projectRoot)

config.watchFolders = [
  path.join(repositoryRoot, 'packages/api-client'),
  path.join(repositoryRoot, 'packages/contracts'),
  path.join(repositoryRoot, 'packages/domain'),
]
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(repositoryRoot, 'node_modules'),
]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (!moduleName.startsWith('.') || !moduleName.endsWith('.js')) {
    return context.resolveRequest(context, moduleName, platform)
  }

  try {
    return context.resolveRequest(context, moduleName, platform)
  } catch (jsError) {
    const sourcePath = moduleName.slice(0, -3)
    for (const extension of ['.ts', '.tsx']) {
      try {
        return context.resolveRequest(context, `${sourcePath}${extension}`, platform)
      } catch {
        // Keep trying source extensions before returning Metro's original resolution error.
      }
    }
    throw jsError
  }
}

module.exports = config
