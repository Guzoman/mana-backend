const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function rebuildStartNodeCompletely() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Rebuilding Start node with all required variables...');
    
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
    
    console.log('🔧 Found Start node, rebuilding with complete configuration...');
    
    // According to the documentation, the Start node should define ALL flow state variables
    // Based on the documentation in C:\mana-projects\docs\Flowise\Nodos del AgentFlow\1. Start.md
    startNode.data.inputs.startState = [
      {"key": "userId", "value": ""},           // Se rellena con el userId del overrideConfig
      {"key": "route", "value": ""},            // Se rellena con la route del overrideConfig (ej: 'menu')
      {"key": "currentTurn", "value": "0"},      // Valor inicial por defecto, calculado por backend
      {"key": "canvasUpdates", "value": "{}"},   // Objeto vacío para recibir actualizaciones
      {"key": "userLanguage", "value": "es"},   // Idioma del usuario, desde overrideConfig
      {"key": "playerState", "value": "{}"},    // Objeto vacío, reemplazado por LoadUserData
      {"key": "sessionState", "value": "{}"}    // Objeto vacío al inicio de sesión
    ];
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ Start node rebuilt completely!');
    console.log('📝 All variables defined according to documentation:');
    console.log('  - userId: "" (overrideConfig)');
    console.log('  - route: "" (overrideConfig)');
    console.log('  - currentTurn: "0" (default, managed by backend)');
    console.log('  - canvasUpdates: "{}" (empty object)');
    console.log('  - userLanguage: "es" (default, overrideConfig)');
    console.log('  - playerState: "{}" (empty, loaded by LoadUserData)');
    console.log('  - sessionState: "{}" (empty, session management)');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

rebuildStartNodeCompletely();