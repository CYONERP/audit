'use strict';

module.exports = {
  async up() {
    // Audit & Activity não cria dados ou permissões padrão automaticamente.
    // Providers, roles e permissões são configurados fora deste serviço.
  },
  async down() {
    // Sem mutações para desfazer.
  },
};
