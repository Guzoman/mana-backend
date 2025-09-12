const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function checkExampleInputParams() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Checking example flow inputParams to see what makes ephemeral memory appear...');
    
    // Get the example flowData
    const result = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['c9cecbac-f0fc-458f-9cc6-629ea4a4df94']
    );
    
    if (result.rows.length === 0) {
      console.error('❌ Example flow not found');
      return;
    }
    
    let flowData = JSON.parse(result.rows[0].flowData);
    
    // Find the Start node
    const startNode = flowData.nodes.find(node => node.data.name === 'startAgentflow');
    
    if (!startNode) {
      console.error('❌ Start node not found in example flow');
      return;
    }
    
    console.log('📝 Example Start node inputParams:');
    console.log(`Total inputParams: ${startNode.data.inputParams.length}`);
    
    startNode.data.inputParams.forEach((param, index) => {
      console.log(`\n${index + 1}. ${param.label || param.name}:`);
      console.log(`   Name: ${param.name}`);
      console.log(`   Type: ${param.type}`);
      console.log(`   Default: ${param.default}`);
      console.log(`   Display: ${param.display}`);
      if (param.options) {
        console.log(`   Options: ${param.options.map(opt => opt.label).join(', ')}`);
      }
      if (param.array) {
        console.log(`   Array: ${param.array.map(arr => arr.label).join(', ')}`);
      }
    });
    
    console.log('\n📝 Full inputParams structure:');
    console.log(JSON.stringify(startNode.data.inputParams, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkExampleInputParams();