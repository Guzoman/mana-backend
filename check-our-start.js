const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function checkOurStartNode() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Checking our Start node from flow ec813128-dbbc-4ffd-b834-cc15a361ccb1...');
    
    // Get our flowData
    const result = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    if (result.rows.length === 0) {
      console.error('❌ Our flow not found');
      return;
    }
    
    let flowData = JSON.parse(result.rows[0].flowData);
    
    // Find the Start node
    const startNode = flowData.nodes.find(node => node.data.name === 'startAgentflow');
    
    if (!startNode) {
      console.error('❌ Start node not found in our flow');
      return;
    }
    
    console.log('📝 Our Start node configuration:');
    console.log(`- ID: ${startNode.id}`);
    console.log(`- Name: ${startNode.data.name}`);
    console.log(`- Label: ${startNode.data.label || 'no label'}`);
    
    // Check Start node inputs
    const inputs = startNode.data.inputs;
    console.log('\n🔧 Our Start node inputs:');
    Object.keys(inputs).forEach(key => {
      if (inputs[key] !== null && inputs[key] !== undefined && inputs[key] !== '') {
        console.log(`  - ${key}: ${JSON.stringify(inputs[key])}`);
      }
    });
    
    // Check ephemeral memory
    if (inputs.startEphemeralMemory) {
      console.log('\n✅ Ephemeral Memory configured:');
      console.log(`  Value: ${inputs.startEphemeralMemory}`);
    } else {
      console.log('\n❌ Ephemeral Memory not found');
    }
    
    // Check startState
    if (inputs.startState) {
      console.log('\n✅ StartState found:');
      console.log(JSON.stringify(inputs.startState, null, 2));
    } else {
      console.log('\n❌ StartState not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkOurStartNode();