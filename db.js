// CAPA DE DATOS UNIFICADA (SUPABASE Y LOCAL FALLBACK)

window.supabaseClient = null;
window.isSupabaseConfigured = typeof SUPABASE_URL === 'string' && SUPABASE_URL !== "" && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY !== "";

if (window.isSupabaseConfigured) {
  try {
    // Inicializar cliente de Supabase (usando el objeto global del CDN)
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase inicializado correctamente.");
  } catch (e) {
    console.error("Error al inicializar Supabase, activando fallback local:", e);
    window.supabaseClient = null;
  }
} else {
  console.log("Credenciales de Supabase no configuradas. Corriendo en modo 'Local Fallback' (localStorage).");
}

// ==========================================
// INICIALIZACIÓN DE MOCK LOCALSTORAGE
// ==========================================
function initMockDB() {
  if (!localStorage.getItem('mock_matches')) {
    localStorage.setItem('mock_matches', JSON.stringify([]));
  }
  if (!localStorage.getItem('mock_players')) {
    localStorage.setItem('mock_players', JSON.stringify([]));
  }
  if (!localStorage.getItem('mock_votes')) {
    localStorage.setItem('mock_votes', JSON.stringify([]));
  }
}
initMockDB();

// Generador de UUID para simulación local
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Obtener o crear UUID de usuario para limitar votación única
function getOrCreateUserUUID() {
  let uuid = localStorage.getItem('voter_user_uuid');
  if (!uuid) {
    uuid = generateUUID();
    localStorage.setItem('voter_user_uuid', uuid);
  }
  return uuid;
}

// ==========================================
// MÉTODOS DE LA BASE DE DATOS
// ==========================================
const DB = {
  // 1. Obtener un partido por ID
  async getMatch(matchId) {
    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();
      if (error) throw error;
      return data;
    } else {
      const matches = JSON.parse(localStorage.getItem('mock_matches'));
      const match = matches.find(m => m.id === matchId);
      if (!match) throw new Error("Partido no encontrado en LocalStorage");
      return match;
    }
  },

  // 2. Obtener jugadores de un partido
  async getPlayers(matchId) {
    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from('players')
        .select('*')
        .eq('match_id', matchId)
        .order('number', { ascending: true });
      if (error) throw error;
      return data;
    } else {
      const players = JSON.parse(localStorage.getItem('mock_players'));
      return players
        .filter(p => p.match_id === matchId)
        .sort((a, b) => a.number - b.number);
    }
  },

  // 3. Obtener estadísticas de votación (promedio y total votos)
  async getPlayerStats(matchId) {
    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from('player_stats')
        .select('*')
        .eq('match_id', matchId);
      if (error) throw error;
      
      // Convertir a un objeto indexado por player_id para fácil lectura
      const stats = {};
      data.forEach(row => {
        stats[row.player_id] = {
          averageRating: row.average_rating,
          totalVotes: row.total_votes
        };
      });
      return stats;
    } else {
      const players = await this.getPlayers(matchId);
      const votes = JSON.parse(localStorage.getItem('mock_votes'));
      
      const stats = {};
      players.forEach(p => {
        const playerVotes = votes.filter(v => v.player_id === p.id);
        const count = playerVotes.length;
        
        let avg = p.initial_avg || 0.0;
        if (count > 0) {
          const sum = playerVotes.reduce((acc, curr) => acc + curr.rating, 0);
          // Simular promedios acumulando un peso de votantes base para que se vea real
          const BASE_WEIGHT = 1482;
          avg = parseFloat(((p.initial_avg * BASE_WEIGHT + sum) / (BASE_WEIGHT + count)).toFixed(1));
        }
        
        stats[p.id] = {
          averageRating: avg,
          totalVotes: count
        };
      });
      return stats;
    }
  },

  // 4. Enviar un voto
  async submitVote(playerId, rating) {
    const userUuid = getOrCreateUserUUID();
    if (window.supabaseClient) {
      const { error } = await window.supabaseClient
        .from('votes')
        .upsert(
          { player_id: playerId, user_uuid: userUuid, rating: rating },
          { onConflict: 'player_id,user_uuid' }
        );
      if (error) throw error;
    } else {
      const votes = JSON.parse(localStorage.getItem('mock_votes'));
      const existingVoteIdx = votes.findIndex(v => v.player_id === playerId && v.user_uuid === userUuid);
      
      const voteData = {
        id: generateUUID(),
        player_id: playerId,
        user_uuid: userUuid,
        rating: rating,
        created_at: new Date().toISOString()
      };

      if (existingVoteIdx > -1) {
        votes[existingVoteIdx] = voteData;
      } else {
        votes.push(voteData);
      }
      localStorage.setItem('mock_votes', JSON.stringify(votes));
    }
  },

  // 5. Crear un partido (Usado por admin.html)
  async createMatch(title, summary, heroImageFileOrBase64) {
    let heroImageUrl = "";
    
    if (window.supabaseClient) {
      if (heroImageFileOrBase64 instanceof File) {
        // Subir a Supabase Storage (Bucket publico: match-images)
        const fileName = `${Date.now()}_hero_${heroImageFileOrBase64.name.replace(/\s+/g, '_')}`;
        const { error: uploadError } = await window.supabaseClient.storage
          .from('match-images')
          .upload(fileName, heroImageFileOrBase64);
        
        if (uploadError) throw uploadError;
        
        const { data } = window.supabaseClient.storage.from('match-images').getPublicUrl(fileName);
        heroImageUrl = data.publicUrl;
      } else {
        heroImageUrl = heroImageFileOrBase64; // Fallback URL string
      }

      const { data, error } = await window.supabaseClient
        .from('matches')
        .insert({ title, summary, hero_image_url: heroImageUrl })
        .select()
        .single();
      
      if (error) throw error;
      return data.id;
    } else {
      // Guardar en localStorage
      const matches = JSON.parse(localStorage.getItem('mock_matches'));
      const newMatchId = generateUUID();
      
      const newMatch = {
        id: newMatchId,
        title,
        summary,
        hero_image_url: heroImageFileOrBase64, // Guardar base64 o URL mock
        created_at: new Date().toISOString()
      };
      
      matches.push(newMatch);
      localStorage.setItem('mock_matches', JSON.stringify(matches));
      return newMatchId;
    }
  },

  // 6. Cargar jugadores en lote (Usado por admin.html)
  async addPlayers(matchId, playersList) {
    if (window.supabaseClient) {
      const formattedPlayers = [];
      
      for (const p of playersList) {
        let playerImageUrl = "";
        if (p.imageFile instanceof File) {
          // Subir foto de jugador a bucket publico
          const fileName = `${Date.now()}_player_${p.imageFile.name.replace(/\s+/g, '_')}`;
          const { error: uploadError } = await window.supabaseClient.storage
            .from('match-images')
            .upload(fileName, p.imageFile);
          
          if (uploadError) throw uploadError;
          
          const { data } = window.supabaseClient.storage.from('match-images').getPublicUrl(fileName);
          playerImageUrl = data.publicUrl;
        } else {
          playerImageUrl = p.imageUrl;
        }

        formattedPlayers.push({
          match_id: matchId,
          name: p.name,
          number: p.number,
          position: p.position,
          image_url: playerImageUrl,
          initial_avg: p.initialAvg
        });
      }

      const { error } = await window.supabaseClient
        .from('players')
        .insert(formattedPlayers);
      
      if (error) throw error;
    } else {
      const players = JSON.parse(localStorage.getItem('mock_players'));
      
      playersList.forEach(p => {
        players.push({
          id: generateUUID(),
          match_id: matchId,
          name: p.name,
          number: p.number,
          position: p.position,
          image_url: p.imageUrl, // Contiene string Base64 o URL mock
          initial_avg: p.initialAvg
        });
      });
      
      localStorage.setItem('mock_players', JSON.stringify(players));
    }
  },

  // 7. Obtener votos del usuario actual para un partido
  async getUserVotes(matchId) {
    const userUuid = getOrCreateUserUUID();
    const votesObj = {};

    if (window.supabaseClient) {
      // Primero obtener los jugadores del partido
      const players = await this.getPlayers(matchId);
      const playerIds = players.map(p => p.id);
      
      if (playerIds.length === 0) return votesObj;

      const { data, error } = await window.supabaseClient
        .from('votes')
        .select('player_id, rating')
        .eq('user_uuid', userUuid)
        .in('player_id', playerIds);
      
      if (error) throw error;
      
      data.forEach(v => {
        votesObj[v.player_id] = v.rating;
      });
    } else {
      const players = await this.getPlayers(matchId);
      const playerIds = players.map(p => p.id);
      const votes = JSON.parse(localStorage.getItem('mock_votes'));
      
      votes.forEach(v => {
        if (playerIds.includes(v.player_id) && v.user_uuid === userUuid) {
          votesObj[v.player_id] = v.rating;
        }
      });
    }
    
    return votesObj;
  }
};
