const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function reapplyEphemeralMemoryInputParam() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Re-applying ephemeral memory inputParam (making sure it saves this time)...');
    
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
    
    console.log('🔧 Found our Start node, ensuring ephemeral memory is properly configured...');
    
    // Make sure inputs has the ephemeral memory field
    startNode.data.inputs.startEphemeralMemory = true;
    
    // Add the ephemeral memory inputParam with exact example configuration
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
    
    console.log('📝 Ephemeral memory configuration:');
    console.log('  - inputs.startEphemeralMemory: true');
    console.log('  - inputParams: added ephemeral memory param');
    console.log('  - This should make the slider appear in the UI');
    
    // Save the updated flowData
    const updateResult = await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log(`✅ Update completed. Rows affected: ${updateResult.rowCount}`);
    
    // Verify immediately that it was saved
    console.log('\n🔧 Verifying that changes were saved...');
    
    const verifyResult = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    const verifyFlowData = JSON.parse(verifyResult.rows[0].flowData);
    const verifyStartNode = verifyFlowData.nodes.find(node => node.data.name === 'startAgentflow');
    
    const savedEphemeralParam = verifyStartNode.data.inputParams.find(param => param.name === 'startEphemeralMemory');
    
    if (savedEphemeralParam) {
      console.log('✅ SUCCESS: Ephemeral memory inputParam was saved correctly!');
      console.log('  The slider should now appear in the UI');
    } else {
      console.log('❌ ERROR: Changes were not saved correctly');
      console.log('  This might indicate a database lock or Flowise interference');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

reapplyEphemeralMemoryInputParam();