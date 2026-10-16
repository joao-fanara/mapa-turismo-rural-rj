-- Esquema do mapa temático (MySQL 5.7+, InnoDB, utf8mb4). Reutilizável: tudo pertence a um "mapa".
-- Preparado para: exclusão lógica (excluido_em), moderação (status/origem/enviado_por, RF14),
-- tradução com status (automatica/revisada), auditoria e usuários com papéis.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migracoes (
  nome VARCHAR(120) NOT NULL PRIMARY KEY,
  aplicada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mapas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL UNIQUE,
  nome VARCHAR(160) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE regioes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mapa_id INT UNSIGNED NOT NULL,
  slug VARCHAR(80) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  UNIQUE KEY u_regiao (mapa_id, slug),
  CONSTRAINT fk_regiao_mapa FOREIGN KEY (mapa_id) REFERENCES mapas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE municipios (
  codigo CHAR(7) NOT NULL PRIMARY KEY,            -- código IBGE
  nome VARCHAR(120) NOT NULL,
  regiao_id INT UNSIGNED NULL,
  CONSTRAINT fk_mun_regiao FOREIGN KEY (regiao_id) REFERENCES regioes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- rotas (camadas), experiências (eixos) e produtos (tipos): mesma forma
CREATE TABLE termos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mapa_id INT UNSIGNED NOT NULL,
  tipo ENUM('rota','experiencia','produto') NOT NULL,
  slug VARCHAR(80) NOT NULL,
  nome VARCHAR(160) NOT NULL,
  curto VARCHAR(80) NOT NULL,
  cor CHAR(7) NULL,
  simbolo VARCHAR(30) NULL,
  ordem SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY u_termo (mapa_id, tipo, slug),
  CONSTRAINT fk_termo_mapa FOREIGN KEY (mapa_id) REFERENCES mapas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE atrativos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mapa_id INT UNSIGNED NOT NULL,
  codigo VARCHAR(120) NOT NULL,                   -- identificador estável (slug) usado nas fichas e nos QR
  nome VARCHAR(200) NOT NULL,
  municipio_codigo CHAR(7) NOT NULL,
  endereco VARCHAR(300) NOT NULL DEFAULT '',
  descricao TEXT NULL,
  funcionamento VARCHAR(400) NOT NULL DEFAULT '',
  telefone VARCHAR(120) NOT NULL DEFAULT '',
  instagram VARCHAR(160) NOT NULL DEFAULT '',
  site VARCHAR(255) NOT NULL DEFAULT '',
  wifi ENUM('','SIM','NÃO') NOT NULL DEFAULT '',
  agendar ENUM('','SIM','NÃO') NOT NULL DEFAULT '',
  pet ENUM('','SIM','NÃO') NOT NULL DEFAULT '',
  lat DECIMAL(9,6) NULL,
  lng DECIMAL(9,6) NULL,
  precisao ENUM('endereco','referencia','municipal') NOT NULL DEFAULT 'municipal',
  mapa_url VARCHAR(600) NOT NULL DEFAULT '',
  rota_principal_id INT UNSIGNED NULL,
  status ENUM('rascunho','pendente','publicado','recusado') NOT NULL DEFAULT 'publicado',
  origem ENUM('guia','admin','cidadao') NOT NULL DEFAULT 'guia',
  enviado_por VARCHAR(190) NULL,                  -- RF14: identificador gov.br (só o necessário, LGPD)
  motivo_recusa VARCHAR(400) NULL,
  fonte_guia VARCHAR(160) NULL,                   -- região/PDF/página de origem
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em DATETIME NULL,
  excluido_por INT UNSIGNED NULL,
  UNIQUE KEY u_codigo (mapa_id, codigo),
  KEY k_municipio (municipio_codigo),
  KEY k_status (mapa_id, status, excluido_em),
  CONSTRAINT fk_atr_mapa FOREIGN KEY (mapa_id) REFERENCES mapas (id),
  CONSTRAINT fk_atr_mun FOREIGN KEY (municipio_codigo) REFERENCES municipios (codigo),
  CONSTRAINT fk_atr_rota FOREIGN KEY (rota_principal_id) REFERENCES termos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE atrativo_termos (
  atrativo_id INT UNSIGNED NOT NULL,
  termo_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (atrativo_id, termo_id),
  CONSTRAINT fk_at_atr FOREIGN KEY (atrativo_id) REFERENCES atrativos (id) ON DELETE CASCADE,
  CONSTRAINT fk_at_termo FOREIGN KEY (termo_id) REFERENCES termos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE traducoes (
  entidade ENUM('atrativo','termo') NOT NULL,
  entidade_id INT UNSIGNED NOT NULL,
  idioma CHAR(2) NOT NULL,
  campo VARCHAR(30) NOT NULL,                     -- descricao | funcionamento | nome | curto
  texto MEDIUMTEXT NOT NULL,
  status ENUM('automatica','revisada') NOT NULL DEFAULT 'automatica',
  revisado_por INT UNSIGNED NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entidade, entidade_id, idioma, campo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  nome VARCHAR(120) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  papel ENUM('administrador','editor','moderador') NOT NULL DEFAULT 'editor',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  trocar_senha TINYINT(1) NOT NULL DEFAULT 1,
  tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_ate DATETIME NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quando TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INT UNSIGNED NULL,
  acao VARCHAR(40) NOT NULL,                      -- criar | editar | excluir | restaurar | importar | publicar | login
  entidade VARCHAR(30) NOT NULL,
  entidade_id VARCHAR(60) NULL,
  antes MEDIUMTEXT NULL,
  depois MEDIUMTEXT NULL,
  ip VARCHAR(45) NULL,
  KEY k_entidade (entidade, entidade_id),
  KEY k_quando (quando)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
