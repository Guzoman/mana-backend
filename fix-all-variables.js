const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixAgentflowVariables() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing ALL variable format issues in the agentflow...');
    
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
    
    if (loadUserDataNode) {
      console.log('🔧 Fixing LoadUserData Input Variables...');
      
      // Fix Input Variables format (remove spaces)
      loadUserDataNode.data.inputs.customFunctionInputVariables = [
        {
          "variableName": "userId",
          "variableValue": "{{$vars.userId}}"  // ✅ FIXED: no space
        },
        {
          "variableName": "userLanguage",
          "variableValue": "{{$vars.userLanguage || 'es'}}"  // ✅ FIXED: no space
        }
      ];
      
      console.log('🔧 Fixing LoadUserData Update Flow State...');
      
      // Fix Update Flow State format (remove spaces)
      loadUserDataNode.data.inputs.customFunctionUpdateState = [
        {
          "key": "currentDebugCase",
          "value": "{{case}}"  // ✅ FIXED: no space
        },
        {
          "key": "currentUserId",
          "value": "{{userId}}"  // ✅ FIXED: no space
        },
        {
          "key": "lastUserData",
          "value": "{{playerData}}"  // ✅ FIXED: no space
        }
      ];
      
      console.log('  ✅ LoadUserData variables fixed');
    }
    
    // Find the DirectReply node
    const directReplyNode = flowData.nodes.find(node => node.data.name === 'directReplyAgentflow');
    
    if (directReplyNode) {
      console.log('🔧 Fixing DirectReply Message...');
      
      // Fix DirectReply message format (remove spaces)
      directReplyNode.data.inputs.directReplyMessage = `🔧 **DEBUG DE AUTENTICACIÓN**

**Caso:** {{$vars.case}}
**Debug Case:** {{$vars.debugCase}}
**User ID:** {{$vars.userId}}
**Exists:** {{$vars.exists}}
**Valid:** {{$vars.isValid}}
**Error:** {{$vars.error}}
**Language:** {{$vars.userLanguage}}

**Player Data:**
\`\`\`json
{{$vars.playerData}}
\`\`\`

**Timestamp:** {{$vars.timestamp}}`;
      
      console.log('  ✅ DirectReply message fixed');
    }
    
    console.log('\n📝 Summary of fixes:');
    console.log('  - Fixed Input Variables: {{ $vars.userId }} → {{$vars.userId}}');
    console.log('  - Fixed Update State: {{ case }} → {{case}}');
    console.log('  - Fixed DirectReply: {{ $vars.case }} → {{$vars.case}}');
    console.log('  - All variable formats now follow Flowise standard');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('\n✅ ALL variable format issues fixed!');
    console.log('🎯 Variables should now process correctly in all cases');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAgentflowVariables();