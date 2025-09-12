const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function updateOurStartWithEphemeralMemory() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Updating our Start node with ephemeral memory enabled (like the example)...');
    
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
    
    console.log('🔧 Found our Start node, updating to match example configuration...');
    
    // Update ephemeral memory to true (like the example)
    startNode.data.inputs.startEphemeralMemory = true;
    
    console.log('📝 Our Start node updated with:');
    console.log('  - startEphemeralMemory: true (enabled)');
    console.log('  - This matches the example configuration');
    console.log('  - The slider should now appear correctly in the UI');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Our Start node updated with ephemeral memory enabled!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

updateOurStartWithEphemeralMemory();