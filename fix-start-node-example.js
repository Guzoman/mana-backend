const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixStartNodeBasedOnExample() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing Start node based on mathematics example...');
    
    // Get the current flowData
    const result = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    if (result.rows.length === 0) {
      console.error('❌ Chatflow not found');
      return;
    }
    
    let flowData = JSON.parse(result.rows[0].flowData);
    
    // Find the Start node
    const startNode = flowData.nodes.find(node => node.data.name === 'startAgentflow');
    
    if (!startNode) {
      console.error('❌ Start node not found');
      return;
    }
    
    console.log('🔧 Found Start node, fixing based on mathematics example...');
    
    // Based on the mathematics example, the startState should be an empty string
    // The overrideConfig variables are handled automatically by Flowise
    startNode.data.inputs.startState = "";
    
    // Also ensure the Start node has the correct configuration like the example
    startNode.data.inputs.startInputType = "chatInput";
    startNode.data.inputs.startEphemeralMemory = false;
    
    console.log('📝 Start node configuration fixed:');
    console.log('  - startState: "" (empty string, like in the example)');
    console.log('  - startInputType: "chatInput"');
    console.log('  - startEphemeralMemory: false');
    console.log('  - Variables will be handled by overrideConfig automatically');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Start node fixed based on mathematics example!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixStartNodeBasedOnExample();