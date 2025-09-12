const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixStartNodeMinimal() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing Start node with minimal UI-like changes...');
    
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
    
    console.log('🔧 Found Start node, making minimal UI-like changes...');
    
    // Only change the specific values that a user would change in the UI
    // Keep the exact same structure, just modify the value field for specific keys
    const currentState = startNode.data.inputs.startState;
    
    // Find and update userId value (keep empty for debug)
    const userIdVar = currentState.find(item => item.key === 'userId');
    if (userIdVar) {
      userIdVar.value = '';  // Keep empty to be overridden by overrideConfig
    }
    
    // Find and update userLanguage value 
    const userLanguageVar = currentState.find(item => item.key === 'userLanguage');
    if (userLanguageVar) {
      userLanguageVar.value = 'es';  // Default Spanish, can be overridden
    }
    
    // Keep all other variables exactly as they are in the UI
    console.log('📝 Made minimal changes to existing variables:');
    console.log('  - Only modified userId and userLanguage values');
    console.log('  - Kept all existing variables and structure intact');
    console.log('  - This mimics what a user would do in the UI');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Start node fixed with minimal UI-like changes!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixStartNodeMinimal();