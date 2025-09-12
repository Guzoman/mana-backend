const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function addEphemeralMemorySlider() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Adding ephemeral memory slider to Start node...');
    
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
    
    console.log('🔧 Found Start node, adding ephemeral memory field...');
    
    // Add the ephemeral memory field (like in the example)
    startNode.data.inputs.startEphemeralMemory = false;
    
    console.log('📝 Start node updated with:');
    console.log('  - startEphemeralMemory: false');
    console.log('  - This should make the slider appear in the UI');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Ephemeral memory slider added to Start node!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addEphemeralMemorySlider();