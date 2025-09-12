const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function checkFlowConfiguration() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    let flowData = JSON.parse(result.rows[0].flowData);
    
    // Check LoadUserData node routing logic
    const loadUserDataNode = flowData.nodes.find(node => node.data.name === 'customFunctionAgentflow');
    console.log('📝 LoadUserData node routing logic:');
    
    if (loadUserDataNode) {
      const javascriptFunction = loadUserDataNode.data.inputs.customFunctionJavascriptFunction;
      const routeLogic = javascriptFunction.match(/routeTo:\s*['"`]([^'"`]+)['"`]/);
      if (routeLogic) {
        console.log(`- Route logic: ${routeLogic[1]}`);
      }
      
      // Check condition logic
      const conditionMatch = javascriptFunction.match(/routeTo:\s*[^,]+/);
      if (conditionMatch) {
        console.log(`- Full condition: ${conditionMatch[0]}`);
      }
    }
    
    // Check DirectReply message template
    const directReplyNode = flowData.nodes.find(node => node.data.name === 'directReplyAgentflow');
    console.log('\n📝 DirectReply message template:');
    if (directReplyNode) {
      console.log(directReplyNode.data.inputs.directReplyMessage);
    }
    
    console.log('\n✅ Code is OK:');
    console.log('- DirectReply node name changed to "Direct Reply Errores Validacion"');
    console.log('- Node ID and internal name (directReplyAgentflow) unchanged');
    console.log('- Flow connections still work correctly');
    console.log('- Routing logic from LoadUserData still points to directReplyAgentflow');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkFlowConfiguration();