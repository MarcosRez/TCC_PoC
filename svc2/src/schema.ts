import { gql } from "graphql-tag";

export const typeDefs = gql`
  type Item { id: ID!, name: String!, value: Int! }
  type ExternalCheck { ok: Boolean!, latency: Int!, service: String! }

  type Query {
    health: String!
    items: [Item!]!
    external: ExternalCheck!
  }

  input NewItem { name: String!, value: Int! }
  type Mutation {
    createItem(input: NewItem!): Boolean!
  }
`;
