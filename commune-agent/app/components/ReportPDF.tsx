import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { CommuneAnalysis } from "@/app/types";

const blue = "#2563eb";
const lightBlue = "#dbeafe";
const darkBlue = "#1e3a8a";
const textGray = "#374151";
const labelGray = "#6b7280";
const mutedGray = "#9ca3af";
const cardBg = "#f8fafc";
const borderColor = "#e2e8f0";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    fontSize: 9,
    color: textGray,
  },
  header: {
    backgroundColor: blue,
    paddingHorizontal: 40,
    paddingVertical: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headerTitle: {
    color: "white",
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
  },
  headerSub: {
    color: "#bfdbfe",
    fontSize: 8,
    marginTop: 4,
  },
  headerDate: {
    color: "#93c5fd",
    fontSize: 8,
    textAlign: "right",
  },
  body: {
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 48,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: darkBlue,
    paddingBottom: 6,
    marginBottom: 10,
    borderBottom: `1 solid ${lightBlue}`,
  },
  paragraph: {
    fontSize: 9,
    lineHeight: 1.7,
    color: textGray,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    width: "48%",
    backgroundColor: cardBg,
    borderRadius: 4,
    padding: "10 12",
    border: `1 solid ${borderColor}`,
  },
  cardLabel: {
    fontSize: 7.5,
    color: labelGray,
    marginBottom: 5,
  },
  cardValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  cardUnit: {
    fontSize: 7.5,
    color: labelGray,
    marginTop: 2,
  },
  badge: {
    backgroundColor: lightBlue,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  badgeText: {
    color: darkBlue,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1 solid ${borderColor}`,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: mutedGray,
  },
});

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR");
}

interface Props {
  analysis: CommuneAnalysis | null;
  text: string;
  date: string;
}

export default function ReportPDF({ analysis, text, date }: Props) {
  const communeName = analysis?.commune?.nom ?? "Analyse commune";
  const dept = analysis?.commune?.departement;
  const region = analysis?.commune?.region;
  const subtitle = [dept, region].filter(Boolean).join(" · ");

  return (
    <Document title={`Rapport — ${communeName}`} author="Commune Agent">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{communeName}</Text>
            {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
            <Text style={[styles.headerSub, { marginTop: 8 }]}>
              Commune Agent · Données ouvertes France
            </Text>
          </View>
          <Text style={styles.headerDate}>{date}</Text>
        </View>

        <View style={styles.body}>
          {/* Synthesis text */}
          {text.trim().length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Synthèse</Text>
              <Text style={styles.paragraph}>{text}</Text>
            </View>
          )}

          {analysis && (
            <>
              {/* Population */}
              {(analysis.population?.total != null ||
                analysis.population?.densite_hab_km2 != null) && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Population</Text>
                  <View style={styles.grid}>
                    {analysis.population?.total != null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>Population totale</Text>
                        <Text style={styles.cardValue}>
                          {fmt(analysis.population.total)}
                        </Text>
                        <Text style={styles.cardUnit}>habitants</Text>
                      </View>
                    )}
                    {analysis.population?.densite_hab_km2 != null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>Densité</Text>
                        <Text style={styles.cardValue}>
                          {analysis.population.densite_hab_km2.toFixed(1)}
                        </Text>
                        <Text style={styles.cardUnit}>hab / km²</Text>
                      </View>
                    )}
                    {analysis.population?.superficie_km2 != null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>Superficie</Text>
                        <Text style={styles.cardValue}>
                          {analysis.population.superficie_km2.toFixed(1)}
                        </Text>
                        <Text style={styles.cardUnit}>km²</Text>
                      </View>
                    )}
                    {analysis.population?.grille_densite && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>Catégorie</Text>
                        <Text style={[styles.cardValue, { fontSize: 10 }]}>
                          {analysis.population.grille_densite}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Immobilier */}
              {(analysis.immobilier?.prix_median_m2_appt != null ||
                analysis.immobilier?.prix_median_m2_maison != null) && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Immobilier</Text>
                  <View style={styles.grid}>
                    {analysis.immobilier?.prix_median_m2_appt != null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>
                          Prix médian — Appartement
                        </Text>
                        <Text style={styles.cardValue}>
                          {fmt(analysis.immobilier.prix_median_m2_appt)}
                        </Text>
                        <Text style={styles.cardUnit}>€ / m²</Text>
                      </View>
                    )}
                    {analysis.immobilier?.prix_median_m2_maison != null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>
                          Prix médian — Maison
                        </Text>
                        <Text style={styles.cardValue}>
                          {fmt(analysis.immobilier.prix_median_m2_maison)}
                        </Text>
                        <Text style={styles.cardUnit}>€ / m²</Text>
                      </View>
                    )}
                    {analysis.immobilier?.evolution_prix_2022_2024_pct !=
                      null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>
                          Évolution 2022 – 2024
                        </Text>
                        <Text style={styles.cardValue}>
                          {analysis.immobilier.evolution_prix_2022_2024_pct > 0
                            ? "+"
                            : ""}
                          {analysis.immobilier.evolution_prix_2022_2024_pct.toFixed(
                            1
                          )}{" "}
                          %
                        </Text>
                      </View>
                    )}
                    {analysis.immobilier?.nb_transactions_appt != null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>
                          Transactions appartements
                        </Text>
                        <Text style={styles.cardValue}>
                          {fmt(analysis.immobilier.nb_transactions_appt)}
                        </Text>
                        <Text style={styles.cardUnit}>mutations</Text>
                      </View>
                    )}
                    {analysis.immobilier?.nb_transactions_maison != null && (
                      <View style={styles.card}>
                        <Text style={styles.cardLabel}>
                          Transactions maisons
                        </Text>
                        <Text style={styles.cardValue}>
                          {fmt(analysis.immobilier.nb_transactions_maison)}
                        </Text>
                        <Text style={styles.cardUnit}>mutations</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Logement social */}
              {analysis.logement?.taux_logements_sociaux_pct != null && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Logement social</Text>
                  <View style={styles.grid}>
                    <View style={styles.card}>
                      <Text style={styles.cardLabel}>
                        Taux de logements sociaux
                      </Text>
                      <Text style={styles.cardValue}>
                        {analysis.logement.taux_logements_sociaux_pct.toFixed(
                          1
                        )}{" "}
                        %
                      </Text>
                    </View>
                  </View>
                </View>
              )}

            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Commune Agent — data.gouv.fr · Données publiques françaises
          </Text>
          <Text style={styles.footerText}>{date}</Text>
        </View>
      </Page>
    </Document>
  );
}
