describe('home page', () => {
  it('loads and shows greeting', () => {
    cy.visit('/');
    cy.contains('Hello, Next.js + Tailwind!').should('be.visible');
  });
});
