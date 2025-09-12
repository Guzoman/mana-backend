const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function verifyLoadUserDataVars() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Verifying LoadUserData $vars configuration...');
    
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
    
    const javascriptFunction = loadUserDataNode.data.inputs.customFunctionJavascriptFunction;
    
    console.log('🔧 Checking $vars assignments in LoadUserData:');
    
    // Look for $vars assignments
    const varsAssignments = javascriptFunction.match(/\$vars\.\w+\s*=/g);
    if (varsAssignments) {
      varsAssignments.forEach(assignment => {
        console.log(`  - ${assignment}`);
      });
    }
    
    // Look for return statement
    const returnMatch = javascriptFunction.match(/return\s*{[^}]+}/);
    if (returnMatch) {
      console.log('\n🔧 Return statement:');
      console.log(`  ${returnMatch[0]}`);
    }
    
    // Check Update Flow State configuration
    const updateState = loadUserDataNode.data.inputs.customFunctionUpdateState;
    if (updateState) {
      console.log('\n🔧 Update Flow State configuration:');
      updateState.forEach(state => {
        console.log(`  - ${state.key}: ${state.value}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyLoadUserDataVars();