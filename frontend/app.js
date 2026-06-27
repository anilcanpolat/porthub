const devicesEl = document.getElementById('devices');

async function loadServices() {
  const res = await fetch('/api/services');
  const data = await res.json();

  devicesEl.innerHTML = '';

  for (const [host, services] of Object.entries(data)) {
    const block = document.createElement('div');
    block.className = 'device-block';

    block.innerHTML = `<h2>📡 ${host}</h2><div class="cards" id="cards-${host}"></div>`;
    devicesEl.appendChild(block);

    const cardsEl = document.getElementById(`cards-${host}`);

    services.forEach(svc => {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = `http://${host}:${svc.port}`;
      card.target = '_blank';
      card.innerHTML = `
        <div class="port">${svc.port}</div>
        <div class="label">${svc.label || 'Unknown'}</div>
        <div class="source">${svc.source}</div>
      `;
      cardsEl.appendChild(card);
    });
  }
}

loadServices();
setInterval(loadServices, 30000);
