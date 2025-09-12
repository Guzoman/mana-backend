const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixStartNodeCorrectly() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing Start node with correct structure...');
    
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
    
    console.log('🔧 Found Start node, fixing with correct structure...');
    
    // Based on the well-formed example c9cecbac-f0fc-458f-9cc6-629ea4a4df94
    // The startState should be an array with key-value pairs
    // Using {{$vars.variableName}} syntax to reference overrideConfig variables
    startNode.data.inputs.startState = [
      {"key": "userId", "value": "{{$vars.userId}}"},
      {"key": "userLanguage", "value": "{{$vars.userLanguage || 'es'}}"}
    ];
    
    console.log('📝 Start node configuration fixed correctly:');
    console.log('  - startState: array with key-value pairs');
    console.log('  - userId: {{$vars.userId}} (from overrideConfig)');
    console.log('  - userLanguage: {{$vars.userLanguage || \'es\'}} (from overrideConfig with default)');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Start node fixed with correct structure!');
    console.log('🔍 Variables will now be properly received from overrideConfig');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixStartNodeCorrectly();