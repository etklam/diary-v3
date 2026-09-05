import { createDatabase } from '@diary/db'
import type { ApiConfig } from './app.js'
import { createApiRuntime } from './runtime.js'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('NODE_ENV is invalid')

const database = createDatabase(required('DATABASE_URL'))
const config: ApiConfig = {
  jwtSecret: required('JWT_SECRET'),
  nodeEnv: nodeEnv as ApiConfig['nodeEnv'],
  trustProxy: process.env.TRUST_X_FORWARDED_FOR === 'true',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3100',
}
const runtime = createApiRuntime({ db: database.db, databasePool: database.pool, config })
const port = Number(process.env.API_PORT ?? 3101)
const hostname = process.env.API_HOST ?? '127.0.0.1'

runtime.server.listen(port, hostname, () => {
  console.log(`Diary API listening on http://${hostname}:${port}`)
})

async function shutdown() {
  await runtime.close()
  await database.pool.end()
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
