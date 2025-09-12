const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixFlowiseStartNode() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing Flowise Start node configuration...');
    
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
    
    console.log('🔧 Found Start node, updating configuration...');
    
    // Update the Start node to properly initialize flow state variables
    // The Start node should set initial values that can be overridden by overrideConfig
    startNode.data.inputs.startState = [
      {"key": "userId", "value": "{{ $vars.userId || '' }}"},
      {"key": "userLanguage", "value": "{{ $vars.userLanguage || 'es' }}"}
    ];
    
    // Also update the CustomFunction node to ensure it's using the correct variable references
    const customFunctionNode = flowData.nodes.find(node => node.data.name === 'customFunctionAgentflow');
    
    if (customFunctionNode) {
      console.log('🔧 Updating CustomFunction node configuration...');
      
      // Ensure the CustomFunction node is using the correct input variable references
      customFunctionNode.data.inputs.customFunctionInputVariables = [
        {"variableName": "userId", "variableValue": "{{ $vars.userId }}"},
        {"variableName": "userLanguage", "variableValue": "{{ $vars.userLanguage || 'es' }}"}
      ];
      
      // Update the flow state update section
      customFunctionNode.data.inputs.customFunctionUpdateState = [
        {"key": "currentDebugCase", "value": "{{ case }}"},
        {"key": "currentUserId", "value": "{{ userId }}"},
        {"key": "lastUserData", "value": "{{ playerData }}"}
      ];
    }
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Flowise Start node configuration updated successfully!');
    console.log('📝 Changes made:');
    console.log('  - Start node now properly handles overrideConfig variables');
    console.log('  - CustomFunction node input variables updated');
    console.log('  - Flow state variables properly configured');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixFlowiseStartNode();