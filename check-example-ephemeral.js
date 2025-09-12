const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function checkExampleWithEphemeralMemory() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Checking example flow c9cecbac-f0fc-458f-9cc6-629ea4a4df94 with ephemeral memory enabled...');
    
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
    
    console.log('📝 Example Start node with ephemeral memory enabled:');
    console.log(`- ID: ${startNode.id}`);
    console.log(`- Name: ${startNode.data.name}`);
    console.log(`- Label: ${startNode.data.label || 'no label'}`);
    
    // Check all Start node inputs
    const inputs = startNode.data.inputs;
    console.log('\n🔧 All Start node inputs:');
    Object.keys(inputs).forEach(key => {
      if (inputs[key] !== null && inputs[key] !== undefined && inputs[key] !== '') {
        console.log(`  - ${key}: ${JSON.stringify(inputs[key])}`);
      }
    });
    
    // Check ephemeral memory specifically
    if (inputs.startEphemeralMemory !== undefined) {
      console.log('\n✅ Ephemeral Memory configuration:');
      console.log(`  Value: ${inputs.startEphemeralMemory}`);
      console.log(`  Type: ${typeof inputs.startEphemeralMemory}`);
    }
    
    // Check startState
    if (inputs.startState) {
      console.log('\n✅ StartState configuration:');
      console.log(JSON.stringify(inputs.startState, null, 2));
    }
    
    // Check if there are other memory-related fields
    const memoryFields = Object.keys(inputs).filter(key => key.toLowerCase().includes('memory'));
    if (memoryFields.length > 0) {
      console.log('\n🔧 All memory-related fields:');
      memoryFields.forEach(field => {
        console.log(`  - ${field}: ${JSON.stringify(inputs[field])}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkExampleWithEphemeralMemory();