import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { IdentityManager, NexusClient } from '../index';
/**
 * TEST D'INTÉGRATION : RÉSILIENCE & PRIORITÉ
 * Simule un Orchestrateur instable pour valider le retry automatique et le nouveau protocole v0.1.7.
 */
describe('Nexus JS SDK Integration', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;
  let requestCount = 0;
  let lastBodyReceived: any = null;
  let lastSignatureHeader: string | undefined = undefined;

  // 1. Setup : Démarrer un serveur HTTP réel avant les tests
  beforeAll((done) => {
    server = createServer((req, res) => {
      // Configuration basique
      res.setHeader('Content-Type', 'application/json');

      if (req.url?.includes('/v1/a2a/transact') && req.method === 'POST') {
        requestCount++;

        // Capture du corps de la requête et de la signature pour validation
        let body = '';
        lastSignatureHeader = req.headers['x-agent-signature'] as string | undefined;

        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          if (body) {
            lastBodyReceived = JSON.parse(body);
          }

          // LOGIQUE DE RÉSILIENCE :
          // Les appels 1 et 2 échouent (503 Service Unavailable)
          // L'appel 3 réussit (200 OK)
          if (requestCount < 3) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Service Unavailable (Simulated)' }));
          } else {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'success', tx_id: 'js-resilience-ok' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Écoute sur un port aléatoire (0)
    server.listen(0, () => {
      const addr = server.address() as AddressInfo;
      port = addr.port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[MOCK SERVER] Listening on ${baseUrl}`);
      done();
    });
  });

  // Nettoyage après les tests
  afterAll((done) => {
    server.close(done);
  });

  test('Doit survivre aux erreurs 503 et transmettre la Priorité (v0.1.7 Protocol)', async () => {
    // A. Initialisation du Client
    const identity = await IdentityManager.generate();
    // On pointe le client vers notre serveur local capricieux
    const client = new NexusClient(identity, baseUrl, baseUrl, 'agent-js-007');

    // B. Exécution de la Transaction
    // On demande une priorité 'high' pour vérifier que le champ passe bien
    console.log(`\n[TEST] Lancement transaction vers ${baseUrl}...`);

    const startTime = Date.now();

    const result = await client.transact(
      { service_id: 'srv-test', provider_agent_id: 'target', service_type: 'test' },
      { msg: 'hello_world' },
      'high' // <--- Test du paramètre Priority
    );

    const duration = Date.now() - startTime;

    // C. Validations (Assertions)

    // 1. Vérifier que la transaction a réussi malgré les pannes
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
    expect(result.tx_id).toBe('js-resilience-ok');

    // 2. Vérifier que le client a bien réessayé 3 fois (2 échecs + 1 succès)
    expect(requestCount).toBe(3);
    console.log(`[SUCCESS] Résilience validée : ${requestCount} tentatives en ${duration}ms`);

    // 3. Vérifier le Protocole v0.1.7 (Flat JSON + Signature Header)
    expect(lastBodyReceived).not.toBeNull();

    // Le corps doit contenir les champs requis
    expect(lastBodyReceived.service_id).toBe('srv-test');
    expect(lastBodyReceived.consumer_agent_id).toBe('agent-js-007');
    expect(lastBodyReceived.payload).toEqual({ msg: 'hello_world' });
    expect(lastBodyReceived.priority).toBe('high');

    // La signature doit être dans le header, pas dans le body
    expect(lastSignatureHeader).toBeDefined();
    expect(lastSignatureHeader).toBeTruthy();

    console.log(`[SUCCESS] Protocole v0.1.7 validé : Priority='${lastBodyReceived.priority}' + Signature in Header`);
  }, 10000); // Timeout large (10s) pour laisser le temps aux retries (1s + 2s + ...)
});