const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixEphemeralMemoryInputParam() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing ephemeral memory inputParam with exact example configuration...');
    
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
    
    console.log('🔧 Found our Start node, replacing ephemeral memory inputParam...');
    
    // Find and replace the ephemeral memory inputParam with exact example configuration
    const ephemeralMemoryParam = {
      "label": "Ephemeral Memory",
      "name": "startEphemeralMemory",
      "type": "boolean",
      "description": "Start fresh for every execution without past chat history",
      "optional": true,
      "id": "startAgentflow_0-input-startEphemeralMemory-boolean",
      "display": true
    };
    
    // Remove any existing ephemeral memory param and add the correct one
    startNode.data.inputParams = startNode.data.inputParams.filter(param => param.name !== 'startEphemeralMemory');
    startNode.data.inputParams.push(ephemeralMemoryParam);
    
    console.log('📝 Fixed ephemeral memory inputParam with exact example configuration:');
    console.log('  - label: "Ephemeral Memory"');
    console.log('  - name: "startEphemeralMemory"');
    console.log('  - type: "boolean"');
    console.log('  - description: "Start fresh for every execution without past chat history"');
    console.log('  - optional: true');
    console.log('  - display: true');
    console.log('  - This should make the slider appear correctly in the UI');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Ephemeral memory inputParam fixed with exact example configuration!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixEphemeralMemoryInputParam();