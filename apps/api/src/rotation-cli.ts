import {createDatabase} from '@diary/db';
import {createMarketData} from './market-data/index.js';
import {createFixtureUpstream} from './market-data/fixture.js';
import {createYahooUpstream} from './market-data/yahoo.js';
import {runRotationBatch} from './rotation-batch.js';
import {executeRotationCommand,parseRotationArgs} from './rotation-command.js';
async function main(){
 const scope=parseRotationArgs(process.argv.slice(2)),url=process.env.DATABASE_URL;
 if(!url)throw new Error('DATABASE_URL is required');
 const database=createDatabase(url);
 try{
  const market=createMarketData({upstream:process.env.MARKET_PROVIDER==='fixture'?createFixtureUpstream():createYahooUpstream()});
  const output=await executeRotationCommand(scope,selected=>runRotationBatch({...database,market},selected));
  console.log(JSON.stringify(output));process.exitCode=output.success?0:1;
 }finally{await database.pool.end();}
}
main().catch(()=>{console.error(JSON.stringify({success:false,operation:'market_rotation_batch',errorMessage:'Unable to start or close the batch. Check arguments and runtime configuration.'}));process.exitCode=1;});
