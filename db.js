// CAPA DE DATOS UNIFICADA (SUPABASE Y LOCAL FALLBACK)

window.supabaseClient = null;
window.isSupabaseConfigured = false;
let isInitialized = false;

const DB = {
  // Inicialización dinámica y asíncrona de credenciales (Vercel vs Local)
  async initialize() {
    if (isInitialized) return;
    
    let url = "";
    let key = "";

    // 1. Intentar obtener credenciales de las variables de entorno de Vercel a través de la API Serverless
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        url = config.SUPABASE_URL || "";
        key = config.SUPABASE_ANON_KEY || "";
      }
    } catch (e) {
      // En local double-click, fallará el fetch, lo cual es normal
      console.log("No se pudo contactar con /api/config. Usando config.js local.");
    }

    // 2. Si no se obtuvieron de la API de Vercel, usar las variables locales de config.js
    if (!url && typeof SUPABASE_URL !== 'undefined') url = SUPABASE_URL;
    if (!key && typeof SUPABASE_ANON_KEY !== 'undefined') key = SUPABASE_ANON_KEY;

    window.isSupabaseConfigured = url !== "" && key !== "";

    if (window.isSupabaseConfigured) {
      try {
        // Inicializar cliente de Supabase (usando el objeto global del CDN)
        window.supabaseClient = window.supabase.createClient(url, key);
        console.log("Supabase inicializado correctamente.");
      } catch (e) {
        console.error("Error al inicializar Supabase, activando fallback local:", e);
        window.supabaseClient = null;
      }
    } else {
      console.log("Credenciales de Supabase no configuradas. Corriendo en modo 'Local Fallback' (localStorage).");
    }
    
    // Inicializar mock
    initMockDB();
    isInitialized = true;
  },

  // 1. Obtener todos los partidos (para el listado de edición)
  async getMatches() {
    await this.initialize();
    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from('matches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    } else {
      return JSON.parse(localStorage.getItem('mock_matches')) || [];
    }
  },

  // 2. Obtener un partido por ID
  async getMatch(matchId) {
    await this.initialize();
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

  // 3. Obtener jugadores de un partido
  async getPlayers(matchId) {
    await this.initialize();
    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from('players')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    } else {
      const players = JSON.parse(localStorage.getItem('mock_players'));
      return players
        .filter(p => p.match_id === matchId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
  },

  // 4. Obtener estadísticas de votación (promedio y total votos)
  async getPlayerStats(matchId) {
    await this.initialize();
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

  // 5. Enviar un voto
  async submitVote(playerId, rating) {
    await this.initialize();
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

  // 6. Crear un partido (Usado por admin.html)
  async createMatch(title, summary, heroImageFileOrBase64) {
    await this.initialize();
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

  // 7. Actualizar un partido existente (Usado por admin.html en modo edición)
  async updateMatch(matchId, title, summary, heroImageFileOrBase64) {
    await this.initialize();
    let heroImageUrl = null;
    
    if (window.supabaseClient) {
      const updateData = { title, summary };
      
      if (heroImageFileOrBase64) {
        if (heroImageFileOrBase64 instanceof File) {
          const fileName = `${Date.now()}_hero_${heroImageFileOrBase64.name.replace(/\s+/g, '_')}`;
          const { error: uploadError } = await window.supabaseClient.storage
            .from('match-images')
            .upload(fileName, heroImageFileOrBase64);
          
          if (uploadError) throw uploadError;
          
          const { data } = window.supabaseClient.storage.from('match-images').getPublicUrl(fileName);
          heroImageUrl = data.publicUrl;
          updateData.hero_image_url = heroImageUrl;
        } else {
          heroImageUrl = heroImageFileOrBase64;
          updateData.hero_image_url = heroImageUrl;
        }
      }

      const { error } = await window.supabaseClient
        .from('matches')
        .update(updateData)
        .eq('id', matchId);
      
      if (error) throw error;
    } else {
      const matches = JSON.parse(localStorage.getItem('mock_matches'));
      const matchIdx = matches.findIndex(m => m.id === matchId);
      if (matchIdx > -1) {
        matches[matchIdx].title = title;
        matches[matchIdx].summary = summary;
        if (heroImageFileOrBase64) {
          matches[matchIdx].hero_image_url = heroImageFileOrBase64;
        }
        localStorage.setItem('mock_matches', JSON.stringify(matches));
      }
    }
  },

  // 8. Cargar jugadores en lote
  async addPlayers(matchId, playersList) {
    await this.initialize();
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
          playerImageUrl = p.imageUrl || p.image_url;
        }

        formattedPlayers.push({
          match_id: matchId,
          name: p.name,
          position: p.position,
          image_url: playerImageUrl,
          initial_avg: p.initialAvg || p.initial_avg
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
          position: p.position,
          image_url: p.imageUrl || p.image_url, // Contiene string Base64 o URL mock
          initial_avg: p.initialAvg || p.initial_avg,
          created_at: new Date().toISOString()
        });
      });
      
      localStorage.setItem('mock_players', JSON.stringify(players));
    }
  },

  // 9. Sincronizar jugadores de un partido (soporta adición, edición y eliminación de jugadores)
  async syncPlayers(matchId, playersList) {
    await this.initialize();
    if (window.supabaseClient) {
      // 1. Traer los jugadores existentes en la base de datos
      const existingPlayers = await this.getPlayers(matchId);
      const existingIds = existingPlayers.map(p => p.id);
      
      // 2. Identificar cuáles fueron eliminados (están en BD pero no vienen en el nuevo playersList)
      const incomingIds = playersList.filter(p => p.id).map(p => p.id);
      const deletedIds = existingIds.filter(id => !incomingIds.includes(id));
      
      if (deletedIds.length > 0) {
        const { error: deleteError } = await window.supabaseClient
          .from('players')
          .delete()
          .in('id', deletedIds);
        if (deleteError) throw deleteError;
      }
      
      // 3. Procesar altas y modificaciones
      for (const p of playersList) {
        let playerImageUrl = p.image_url || "";
        
        // Si subió un nuevo archivo
        if (p.imageFile instanceof File) {
          const fileName = `${Date.now()}_player_${p.imageFile.name.replace(/\s+/g, '_')}`;
          const { error: uploadError } = await window.supabaseClient.storage
            .from('match-images')
            .upload(fileName, p.imageFile);
          if (uploadError) throw uploadError;
          
          const { data } = window.supabaseClient.storage.from('match-images').getPublicUrl(fileName);
          playerImageUrl = data.publicUrl;
        }

        const playerData = {
          match_id: matchId,
          name: p.name,
          position: p.position,
          initial_avg: p.initialAvg || p.initial_avg || 0.0
        };
        if (playerImageUrl !== "") {
          playerData.image_url = playerImageUrl;
        }

        if (p.id) {
          // Actualización
          const { error: updateError } = await window.supabaseClient
            .from('players')
            .update(playerData)
            .eq('id', p.id);
          if (updateError) throw updateError;
        } else {
          // Creación de nuevo jugador agregado en la edición
          if (playerImageUrl === "") {
            playerData.image_url = "https://via.placeholder.com/150"; // Fallback si es nuevo y no tiene foto
          }
          const { error: insertError } = await window.supabaseClient
            .from('players')
            .insert(playerData);
          if (insertError) throw insertError;
        }
      }
    } else {
      // Modo Local Fallback
      let allPlayers = JSON.parse(localStorage.getItem('mock_players')) || [];
      
      // Eliminar jugadores que pertenecen a este partido pero ya no vienen en la lista
      const incomingIds = playersList.filter(p => p.id).map(p => p.id);
      allPlayers = allPlayers.filter(p => p.match_id !== matchId || incomingIds.includes(p.id));
      
      // Procesar cada jugador entrante
      playersList.forEach(p => {
        if (p.id) {
          // Actualizar jugador existente
          const idx = allPlayers.findIndex(x => x.id === p.id);
          if (idx > -1) {
            allPlayers[idx].name = p.name;
            allPlayers[idx].position = p.position;
            allPlayers[idx].initial_avg = p.initialAvg || p.initial_avg;
            if (p.imageUrl || p.image_url) {
              allPlayers[idx].image_url = p.imageUrl || p.image_url;
            }
          }
        } else {
          // Insertar nuevo jugador
          allPlayers.push({
            id: generateUUID(),
            match_id: matchId,
            name: p.name,
            position: p.position,
            image_url: p.imageUrl || p.image_url || "https://via.placeholder.com/150",
            initial_avg: p.initialAvg || p.initial_avg || 0.0,
            created_at: new Date().toISOString()
          });
        }
      });
      
      localStorage.setItem('mock_players', JSON.stringify(allPlayers));
    }
  },

  // 10. Duplicar un partido completo con todos sus jugadores
  async duplicateMatch(matchId) {
    await this.initialize();
    // 1. Obtener datos del partido original
    const match = await this.getMatch(matchId);
    
    // 2. Obtener lista de jugadores originales
    const players = await this.getPlayers(matchId);
    
    // 3. Crear el nuevo partido duplicado (copiando título, copete y portada)
    const newMatchId = await this.createMatch(`[Copia] ${match.title}`, match.summary, match.hero_image_url);
    
    // 4. Copiar los jugadores asignándoles el nuevo match_id
    const playersCopy = players.map(p => ({
      name: p.name,
      position: p.position,
      imageUrl: p.image_url,
      initialAvg: p.initial_avg
    }));
    
    await this.addPlayers(newMatchId, playersCopy);
    return newMatchId;
  },

  // 11. Obtener votos del usuario actual para un partido
  async getUserVotes(matchId) {
    await this.initialize();
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

// ==========================================
// AUXILIAR DE INICIALIZACIÓN MOCK LOCAL
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

// Generador de UUID para simulación local e identificación de usuario
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
