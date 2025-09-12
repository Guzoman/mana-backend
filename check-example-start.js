const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function checkExampleStartNode() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Checking Start node from example flow c9cecbac-f0fc-458f-9cc6-629ea4a4df94...');
    
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
    
    console.log('📝 Example Start node configuration:');
    console.log(`- ID: ${startNode.id}`);
    console.log(`- Name: ${startNode.data.name}`);
    console.log(`- Label: ${startNode.data.label || 'no label'}`);
    
    // Check Start node inputs
    const inputs = startNode.data.inputs;
    console.log('\n🔧 Start node inputs:');
    Object.keys(inputs).forEach(key => {
      if (inputs[key] !== null && inputs[key] !== undefined && inputs[key] !== '') {
        console.log(`  - ${key}: ${JSON.stringify(inputs[key])}`);
      }
    });
    
    // Check if ephemeral memory is configured
    if (inputs.startAgentflowEphemeralMemory) {
      console.log('\n✅ Ephemeral Memory configured:');
      console.log(`  Value: ${inputs.startAgentflowEphemeralMemory}`);
    } else {
      console.log('\n❌ Ephemeral Memory not found');
    }
    
    // Check overrideConfig format
    if (inputs.startAgentflowOverrideConfig) {
      console.log('\n✅ OverrideConfig found:');
      console.log(JSON.stringify(inputs.startAgentflowOverrideConfig, null, 2));
    } else {
      console.log('\n❌ OverrideConfig not found');
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

checkExampleStartNode();