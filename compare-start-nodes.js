const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function compareStartNodes() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Comparing both Start nodes to find differences...');
    
    // Get both flows
    const [ourResult, exampleResult] = await Promise.all([
      client.query('SELECT "flowData" FROM chat_flow WHERE id = $1', ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']),
      client.query('SELECT "flowData" FROM chat_flow WHERE id = $1', ['c9cecbac-f0fc-458f-9cc6-629ea4a4df94'])
    ]);
    
    if (ourResult.rows.length === 0) {
      console.error('❌ Our flow not found');
      return;
    }
    
    if (exampleResult.rows.length === 0) {
      console.error('❌ Example flow not found');
      return;
    }
    
    const ourFlow = JSON.parse(ourResult.rows[0].flowData);
    const exampleFlow = JSON.parse(exampleResult.rows[0].flowData);
    
    const ourStartNode = ourFlow.nodes.find(node => node.data.name === 'startAgentflow');
    const exampleStartNode = exampleFlow.nodes.find(node => node.data.name === 'startAgentflow');
    
    if (!ourStartNode || !exampleStartNode) {
      console.error('❌ Start node not found in one of the flows');
      return;
    }
    
    console.log('📝 COMPARISON OF START NODES:');
    console.log('\n=== OUR START NODE ===');
    console.log('ID:', ourStartNode.id);
    console.log('Label:', ourStartNode.data.label);
    console.log('Category:', ourStartNode.category);
    console.log('Position:', ourStartNode.position);
    console.log('\nInputs:');
    Object.keys(ourStartNode.data.inputs).forEach(key => {
      console.log(`  ${key}: ${JSON.stringify(ourStartNode.data.inputs[key])}`);
    });
    
    console.log('\n=== EXAMPLE START NODE ===');
    console.log('ID:', exampleStartNode.id);
    console.log('Label:', exampleStartNode.data.label);
    console.log('Category:', exampleStartNode.category);
    console.log('Position:', exampleStartNode.position);
    console.log('\nInputs:');
    Object.keys(exampleStartNode.data.inputs).forEach(key => {
      console.log(`  ${key}: ${JSON.stringify(exampleStartNode.data.inputs[key])}`);
    });
    
    console.log('\n=== DIFFERENCES ===');
    const ourKeys = Object.keys(ourStartNode.data.inputs);
    const exampleKeys = Object.keys(exampleStartNode.data.inputs);
    
    console.log('Fields in our node but not in example:');
    ourKeys.filter(key => !exampleKeys.includes(key)).forEach(key => {
      console.log(`  - ${key}: ${JSON.stringify(ourStartNode.data.inputs[key])}`);
    });
    
    console.log('\nFields in example but not in our node:');
    exampleKeys.filter(key => !ourKeys.includes(key)).forEach(key => {
      console.log(`  - ${key}: ${JSON.stringify(exampleStartNode.data.inputs[key])}`);
    });
    
    console.log('\n=== FULL NODE STRUCTURE ===');
    console.log('Our node structure:');
    console.log(JSON.stringify(ourStartNode, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

compareStartNodes();