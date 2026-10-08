import { describe, expect, it } from 'vitest';
import { nomeProprio } from '../src/dominio/texto.js';

describe('nomeProprio', () => {
  it('nome todo em maiúsculas fica legível; nome já digitado com minúsculas fica igual', () => {
    expect(nomeProprio('FULANO DE TAL DOS SANTOS')).toBe('Fulano de Tal dos Santos');
    expect(nomeProprio('JOÃO  DA SILVA')).toBe('João  da Silva');
    expect(nomeProprio('DE SOUZA E FILHOS')).toBe('De Souza e Filhos');
    expect(nomeProprio('Maria McDonald')).toBe('Maria McDonald');
  });
});
