const NativeRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

if (NativeRTCPeerConnection) {
  const FRAKTUM_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  function serverKey(server) {
    const urls = Array.isArray(server?.urls) ? server.urls.join('|') : String(server?.urls || '');
    return `${urls}|${server?.username || ''}`;
  }

  function mergeIceServers(existing = []) {
    const merged = [...existing];
    const seen = new Set(merged.map(serverKey));
    for (const server of FRAKTUM_ICE_SERVERS) {
      const key = serverKey(server);
      if (!seen.has(key)) {
        merged.push(server);
        seen.add(key);
      }
    }
    return merged;
  }

  class FraktumRTCPeerConnection extends NativeRTCPeerConnection {
    constructor(configuration = {}) {
      const nextConfiguration = {
        ...configuration,
        iceServers: mergeIceServers(configuration.iceServers || []),
        iceCandidatePoolSize: Math.max(Number(configuration.iceCandidatePoolSize || 0), 4)
      };
      super(nextConfiguration);

      const diagnostics = {
        createdAt: Date.now(),
        connectionState: this.connectionState,
        iceConnectionState: this.iceConnectionState,
        iceGatheringState: this.iceGatheringState,
        localCandidateTypes: [],
        relayCandidateSeen: false,
        selectedCandidatePair: null,
        lastError: null
      };
      window.__fraktumRtcDiagnostics = diagnostics;

      this.addEventListener('icecandidate', event => {
        const candidate = event.candidate?.candidate || '';
        if (!candidate) return;
        const match = candidate.match(/ typ (host|srflx|prflx|relay)(?: |$)/);
        const type = match?.[1] || 'unknown';
        diagnostics.localCandidateTypes.push(type);
        if (type === 'relay') diagnostics.relayCandidateSeen = true;
      });

      this.addEventListener('icecandidateerror', event => {
        diagnostics.lastError = {
          code: event.errorCode || null,
          text: event.errorText || 'ICE candidate error',
          url: event.url || null,
          at: Date.now()
        };
        console.warn('[FRAKTUM WebRTC] ICE candidate error', diagnostics.lastError);
      });

      this.addEventListener('iceconnectionstatechange', () => {
        diagnostics.iceConnectionState = this.iceConnectionState;
      });

      this.addEventListener('icegatheringstatechange', () => {
        diagnostics.iceGatheringState = this.iceGatheringState;
      });

      this.addEventListener('connectionstatechange', async () => {
        diagnostics.connectionState = this.connectionState;
        if (this.connectionState !== 'connected') return;
        try {
          const stats = await this.getStats();
          let selectedPair = null;
          stats.forEach(report => {
            if (report.type === 'transport' && report.selectedCandidatePairId) {
              selectedPair = stats.get(report.selectedCandidatePairId) || selectedPair;
            }
          });
          if (!selectedPair) {
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) selectedPair = report;
            });
          }
          if (selectedPair) {
            const local = stats.get(selectedPair.localCandidateId);
            const remote = stats.get(selectedPair.remoteCandidateId);
            diagnostics.selectedCandidatePair = {
              localType: local?.candidateType || null,
              remoteType: remote?.candidateType || null,
              protocol: local?.protocol || null,
              currentRoundTripTime: selectedPair.currentRoundTripTime ?? null
            };
          }
        } catch (error) {
          diagnostics.lastError = { text: error?.message || String(error), at: Date.now() };
        }
      });
    }
  }

  Object.defineProperty(FraktumRTCPeerConnection, 'name', { value: 'RTCPeerConnection' });
  window.RTCPeerConnection = FraktumRTCPeerConnection;
  if ('webkitRTCPeerConnection' in window) window.webkitRTCPeerConnection = FraktumRTCPeerConnection;

  window.FraktumRTC = {
    iceServers: FRAKTUM_ICE_SERVERS.map(item => ({ ...item, credential: item.credential ? '***' : undefined })),
    diagnostics: () => window.__fraktumRtcDiagnostics || null
  };
}
