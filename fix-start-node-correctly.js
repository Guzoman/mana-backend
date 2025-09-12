const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixFlowiseStartNodeProperly() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing Flowise Start node configuration properly...');
    
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
    
    console.log('🔧 Found Start node, fixing configuration...');
    
    // According to Flowise documentation, the Start node should define variables with simple default values
    // The overrideConfig will automatically override these values
    // Variables are accessed as $vars.<variable-name> in subsequent nodes
    startNode.data.inputs.startState = [
      {"key": "userId", "value": ""},        // Empty default, will be overridden by overrideConfig
      {"key": "userLanguage", "value": "es"}  // Default to 'es', can be overridden by overrideConfig
    ];
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Flowise Start node configuration fixed properly!');
    console.log('📝 Changes made:');
    console.log('  - Start node now defines variables with simple default values');
    console.log('  - userId: empty string (will be overridden by overrideConfig)');
    console.log('  - userLanguage: "es" (default, can be overridden)');
    console.log('  - Variables will be accessed as $vars.userId and $vars.userLanguage in CustomFunction');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixFlowiseStartNodeProperly();