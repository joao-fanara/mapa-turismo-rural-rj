-- Telefone com até 255 caracteres (um guia traz responsável + endereço + contato no campo) e restauração do valor que o
-- banco de produção cortou em 120 (o servidor não estava em modo estrito; a conexão agora liga STRICT_ALL_TABLES).
SET NAMES utf8mb4;
ALTER TABLE atrativos MODIFY telefone VARCHAR(255) NOT NULL DEFAULT '';
UPDATE atrativos SET telefone = 'Responsável: Luciana Endereço: Barra Alegre (Distrito de Bom Jardim) Próximo ao Restaurante Jorge Tardin Turismo. Contato: (22)981137486' WHERE mapa_id = 1 AND codigo = 'casa-do-leite';
INSERT INTO migracoes (nome) VALUES ('003-telefone-e-modo-estrito');
