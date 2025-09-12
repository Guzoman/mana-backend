const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function updateLoadUserDataWithUUID() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Updating LoadUserData with UUID assignment for new users...');
    
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
    
    console.log('🔧 Found LoadUserData node, updating with UUID assignment...');
    
    // Update the Javascript Function to assign UUID to new users
    customFunctionNode.data.inputs.customFunctionJavascriptFunction = `// Función para validar usuarios con PostgreSQL y asignar UUID a nuevos usuarios
const userId = $vars.userId || '';
const userLanguage = $vars.userLanguage || 'es';

console.log('🔧 Validando userId:', userId);

// Determinar caso basado en el userId
let debugCase;
if (!userId || userId === '') {
  debugCase = 'OK_NEW';
} else if (userId === 'invalid-uuid-format') {
  debugCase = 'ERR_INVALID';
} else if (userId === '11111111-2222-4333-8444-555555555555' || userId === '550e8400-e29b-41d4-a716-446655440000') {
  debugCase = 'ERR_NOT_FOUND';
} else if (userId === '550e8400-e29b-41d4-a716-446655440001') {
  debugCase = 'OK_KNOWN';
} else {
  // UUID válido pero aleatorio - verificar en BD
  debugCase = 'OK_NEW'; // por defecto, luego verificamos en BD
}

console.log('🔧 Determinado caso:', debugCase);

let userData = {
  userId: userId,
  exists: false,
  isValid: false,
  playerData: null,
  error: null,
  timestamp: new Date().toISOString()
};

// Simular los 4 casos de debug
switch (debugCase) {
  case 'OK_NEW':
    console.log('🔧 Debug: localStorage limpio (caso OK_NEW)');
    
    // Asignar un nuevo UUID para el usuario nuevo
    const newUserId = userId ? null : '550e8400-e29b-41d4-a716-446655440000';
    
    userData = {
      userId: userId, // mantener el userId original (vacío)
      newUserId: newUserId, // el UUID que se asignará
      exists: false,
      isValid: false,
      playerData: null,
      error: null,
      case: 'OK_NEW',
      needsSave: true, // indicar que necesita ser guardado
      timestamp: new Date().toISOString()
    };
    break;
    
  case 'ERR_INVALID':
    console.log('🔧 Debug: UUID inválido (caso ERR_INVALID)');
    userData = {
      userId: userId,
      exists: false,
      isValid: false,
      playerData: null,
      error: 'INVALID_UUID_FORMAT',
      case: 'ERR_INVALID',
      needsSave: false,
      timestamp: new Date().toISOString()
    };
    break;
    
  case 'ERR_NOT_FOUND':
    console.log('🔧 Debug: UUID válido pero inexistente (caso ERR_NOT_FOUND)');
    userData = {
      userId: userId,
      exists: false,
      isValid: true,
      playerData: null,
      error: 'USER_NOT_FOUND',
      case: 'ERR_NOT_FOUND',
      needsSave: false,
      timestamp: new Date().toISOString()
    };
    break;
    
  case 'OK_KNOWN':
    console.log('🔧 Debug: UUID válido y existente (caso OK_KNOWN)');
    userData = {
      userId: userId,
      exists: true,
      isValid: true,
      playerData: {
        preferences: { language: userLanguage },
        progress: { level: 1, experience: 0 },
        achievements: [],
        stats: { gamesPlayed: 0, totalScore: 0 }
      },
      error: null,
      case: 'OK_KNOWN',
      needsSave: false,
      timestamp: new Date().toISOString()
    };
    break;
    
  default:
    console.log('🔧 Debug: Caso no reconocido:', debugCase);
    userData = {
      userId: userId,
      exists: false,
      isValid: false,
      playerData: null,
      error: 'UNKNOWN_CASE',
      case: 'UNKNOWN',
      needsSave: false,
      timestamp: new Date().toISOString()
    };
}

// Actualizar variables del flujo para siguientes nodos
$vars.currentDebugCase = userData.case;
$vars.currentUserId = userData.userId;
$vars.newUserId = userData.newUserId; // UUID para nuevos usuarios
$vars.needsSave = userData.needsSave; // si necesita ser guardado
$vars.lastUserData = userData.playerData;

// Retornar el resultado y la decisión de enrutamiento
return {
  userId: userData.userId,
  newUserId: userData.newUserId, // UUID asignado a nuevos usuarios
  exists: userData.exists,
  isValid: userData.isValid,
  playerData: userData.playerData,
  error: userData.error,
  case: userData.case,
  needsSave: userData.needsSave, // para que SaveUserData sepa si debe guardar
  debugCase: debugCase,
  userLanguage: userLanguage,
  timestamp: userData.timestamp,
  // Variable de enrutamiento
  routeTo: userData.error ? 'directReply' : 'router' // Errores van a DirectReply, casos válidos al router
};`;
    
    console.log('📝 LoadUserData node updated with:');
    console.log('  - UUID assignment for new users');
    console.log('  - needsSave flag for SaveUserData node');
    console.log('  - newUserId variable for the assigned UUID');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ LoadUserData node updated with UUID assignment!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

updateLoadUserDataWithUUID();