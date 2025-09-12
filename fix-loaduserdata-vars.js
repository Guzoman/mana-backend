const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixLoadUserDataVars() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing LoadUserData to set all required $vars...');
    
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
    
    // Find the LoadUserData node
    const loadUserDataNode = flowData.nodes.find(node => node.data.name === 'customFunctionAgentflow');
    
    if (!loadUserDataNode) {
      console.error('❌ LoadUserData node not found');
      return;
    }
    
    console.log('🔧 Found LoadUserData node, updating $vars assignments...');
    
    // Get the current JavaScript function
    let javascriptFunction = loadUserDataNode.data.inputs.customFunctionJavascriptFunction;
    
    // Replace the $vars assignments section to include all variables
    const oldVarsSection = `// Actualizar variables del flujo para siguientes nodos
$vars.currentDebugCase = userData.case;
$vars.currentUserId = userData.userId;
$vars.newUserId = userData.newUserId; // UUID para nuevos usuarios
$vars.needsSave = userData.needsSave; // si necesita ser guardado
$vars.lastUserData = userData.playerData;`;
    
    const newVarsSection = `// Actualizar variables del flujo para siguientes nodos
$vars.currentDebugCase = userData.case;
$vars.currentUserId = userData.userId;
$vars.case = userData.case;
$vars.debugCase = debugCase;
$vars.exists = userData.exists;
$vars.isValid = userData.isValid;
$vars.error = userData.error;
$vars.playerData = userData.playerData;
$vars.userLanguage = userLanguage;
$vars.timestamp = userData.timestamp;
$vars.newUserId = userData.newUserId; // UUID para nuevos usuarios
$vars.needsSave = userData.needsSave; // si necesita ser guardado
$vars.lastUserData = userData.playerData;`;
    
    // Replace the vars section
    javascriptFunction = javascriptFunction.replace(oldVarsSection, newVarsSection);
    
    // Update the node
    loadUserDataNode.data.inputs.customFunctionJavascriptFunction = javascriptFunction;
    
    console.log('📝 LoadUserData node updated with complete $vars:');
    console.log('  - $vars.case, $vars.debugCase, $vars.exists, $vars.isValid');
    console.log('  - $vars.error, $vars.playerData, $vars.userLanguage, $vars.timestamp');
    console.log('  - All variables now available for DirectReply');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ LoadUserData $vars completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixLoadUserDataVars();