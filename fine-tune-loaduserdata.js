const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fineTuneLoadUserDataNode() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fine-tuning LoadUserData node...');
    
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
    
    // Find the CustomFunction node (LoadUserData)
    const customFunctionNode = flowData.nodes.find(node => node.data.name === 'customFunctionAgentflow');
    
    if (!customFunctionNode) {
      console.error('❌ CustomFunction node not found');
      return;
    }
    
    console.log('🔧 Found LoadUserData node, fine-tuning...');
    
    // Ensure the Input Variables are correctly referencing $vars
    const inputVariables = customFunctionNode.data.inputs.customFunctionInputVariables;
    if (inputVariables) {
      const userIdVar = inputVariables.find(v => v.variableName === 'userId');
      const userLanguageVar = inputVariables.find(v => v.variableName === 'userLanguage');
      
      if (userIdVar) {
        userIdVar.variableValue = '{{ $vars.userId }}';
      }
      if (userLanguageVar) {
        userLanguageVar.variableValue = '{{ $vars.userLanguage || \'es\' }}';
      }
    }
    
    // Ensure the Update Flow State is correctly configured
    const updateState = customFunctionNode.data.inputs.customFunctionUpdateState;
    if (updateState) {
      const currentDebugCase = updateState.find(v => v.key === 'currentDebugCase');
      const currentUserId = updateState.find(v => v.key === 'currentUserId');
      const lastUserData = updateState.find(v => v.key === 'lastUserData');
      
      if (currentDebugCase) {
        currentDebugCase.value = '{{ case }}';
      }
      if (currentUserId) {
        currentUserId.value = '{{ userId }}';
      }
      if (lastUserData) {
        lastUserData.value = '{{ playerData }}';
      }
    }
    
    console.log('📝 LoadUserData node fine-tuned:');
    console.log('  - Input Variables: userId -> {{$vars.userId}}, userLanguage -> {{$vars.userLanguage || \'es\'}}');
    console.log('  - Update Flow State: currentDebugCase, currentUserId, lastUserData');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ LoadUserData node fine-tuned successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fineTuneLoadUserDataNode();