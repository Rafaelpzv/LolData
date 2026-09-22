"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Interface para o hook de manipulação de pesquisa
 */
interface SearchHandlerHook {
  /**
   * Função para lidar com a pesquisa de invocador
   * @param riotid - ID do Riot (no formato "nome#tag")
   * @param region - Região do servidor
   * @param mode - "lol" (padrão) ou "tft"
   * @returns Promise void
   */
  handleSearch: (
    riotid: string,
    region: string,
    mode?: "lol" | "tft",
  ) => Promise<void>;

  /**
   * Estado indicando se está carregando
   */
  isLoading: boolean;

  /**
   * Estado para mensagem de erro
   */
  error: string | null;
}

/**
 * Hook personalizado para gerenciar a pesquisa de invocadores
 * Implementa o princípio de responsabilidade única (S do SOLID)
 * @returns Interface SearchHandlerHook
 */
export function useSearchHandler(): SearchHandlerHook {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Manipula a pesquisa de invocador, validando e redirecionando para a página de perfil
   * @param riotid - ID do Riot (no formato "nome#tag")
   * @param region - Região do servidor
   */
  async function handleSearch(
    riotid: string,
    region: string,
    mode: "lol" | "tft" = "lol",
  ): Promise<void> {
    try {
      setIsLoading(true);
      setError(null);

      const cleanText = (text: string) => {
        return text
          .normalize("NFC") // Normaliza a string
          .replace(/[\u2066-\u2069]/g, "") // Remove caracteres invisíveis
          .replace(/\s+/g, " ") // Substitui múltiplos espaços por um único
          .trim(); // Remove espaços extras nas extremidades
      };

      const sanitizedRiotId = cleanText(riotid);

      // Separar nome e tag corretamente
      const parts = sanitizedRiotId.split("#");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        setError("Por favor, insira um Riot ID válido no formato Nome#Tag");
        return;
      }

      const [gameName, tagLine] = parts.map(cleanText);

      // Codifica os segmentos para a URL (nomes com espaços/acentos/trema/emoji).
      // Antes usava decodeURIComponent aqui, o que quebrava URLs com texto cru.
      const encodedGameName = encodeURIComponent(gameName.trim());
      const encodedTagLine = encodeURIComponent(tagLine.trim());

      // Converter a região para lowercase
      const sanitizedRegion = region.toLowerCase();
      if (sanitizedRegion == "") {
        setError("Por favor, seleciona uma região.");
        return;
      }
      // Navega para a rota dinâmica (TFT ou LoL)
      if (mode === "tft") {
        router.push(
          `/tft/${sanitizedRegion}/${encodedGameName}/${encodedTagLine}`,
        );
      } else {
        router.push(
          `/lol/${sanitizedRegion}/${encodedGameName}/${encodedTagLine}/all/all`,
        );
      }
    } catch (error) {
      console.error("Erro ao processar a pesquisa:", error);
      setError("Ocorreu um erro ao processar sua pesquisa. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  // async function handleNewSearch(riotid: string){
  //   if (riotid === '') {
  //     console.error('Antes de clicar no botão, escreva um Riot ID!');
  //     return;
  //   }
  //   if (lastRegion === '') {
  //     console.error('Nenhuma região foi usada anteriormente. Faça uma busca inicial primeiro!');
  //     return;
  //   }

  //   // Remover todos os espaços antes de dividir o Riot ID
  //   const sanitizedRiotId = riotid.replace(/\s+/g, '');

  //   // Separar o nome e a tag, garantindo que ambos existam
  //   const [gameName, tagLine = 'default'] = sanitizedRiotId.split('#');

  //   // Navega para a rota dinâmica com a última região usada
  //   router.push(`/lol/${lastRegion}/${gameName}/${tagLine}`);
  // };

  return {
    handleSearch,
    isLoading,
    error,
  };
}
