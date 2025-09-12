const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function addEphemeralMemoryInputParam() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Adding ephemeral memory inputParam to make slider appear in UI...');
    
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
    
    console.log('🔧 Found our Start node, adding ephemeral memory inputParam...');
    
    // Add the ephemeral memory inputParam (this controls UI visibility)
    const ephemeralMemoryParam = {
      "label": "Ephemeral Memory",
      "name": "startEphemeralMemory",
      "type": "boolean",
      "default": false,
      "id": "startAgentflow_0-input-startEphemeralMemory-boolean",
      "display": true
    };
    
    startNode.data.inputParams.push(ephemeralMemoryParam);
    
    console.log('📝 Added ephemeral memory inputParam:');
    console.log('  - label: "Ephemeral Memory"');
    console.log('  - name: "startEphemeralMemory"');
    console.log('  - type: "boolean"');
    console.log('  - default: false');
    console.log('  - display: true');
    console.log('  - This should make the slider appear in the UI');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Ephemeral memory inputParam added!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addEphemeralMemoryInputParam();