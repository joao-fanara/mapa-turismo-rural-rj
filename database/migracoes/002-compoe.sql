-- Termos ganham 'compoe' (o que a rota reúne, mostrado na lista) para o banco gerar lentes.json sozinho.
SET NAMES utf8mb4;
ALTER TABLE termos ADD COLUMN compoe TEXT NULL AFTER simbolo;
UPDATE termos SET compoe = 'produção e degustação de café; fazendas históricas' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'cafe';
UPDATE termos SET compoe = 'queijos e laticínios; doce de leite' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'queijos';
UPDATE termos SET compoe = 'cachaças e alambiques; cervejas e vinhos artesanais; doces, geleias e mel' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'bebidas-doces';
UPDATE termos SET compoe = 'frutas e pomares; flores e plantas; hortas e orgânicos' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'colheitas';
UPDATE termos SET compoe = 'pesque-pague; pesca e cultura caiçara' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'pesca';
UPDATE termos SET compoe = 'trilhas e cachoeiras; Mata Atlântica e observação de aves' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'natureza';
UPDATE termos SET compoe = 'restaurantes rurais; pousadas e hospedagem' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'mesa-pouso';
UPDATE termos SET compoe = 'artesanato; festas tradicionais; museus e igrejas' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'cultura';
UPDATE termos SET compoe = 'cavalgadas e haras; sítios de lazer e fazendinhas; outras vivências' WHERE mapa_id = 1 AND tipo = 'rota' AND slug = 'campo';
INSERT INTO migracoes (nome) VALUES ('002-compoe');
