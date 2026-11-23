"""
ScoutAI Mental Stat-Line Engine
Computes ERL, DPS, CMP, LCS, and character profile for players based on match data,
and exports complete mental stats JSON/CSV reports.
"""

import json
import csv
import io

class MentalIndexEngine:
    def __init__(self, match_data=None):
        self.match_data = match_data or {}

    def compute_metrics(self, player_stats):
        """
        Computes ERL, DPS, CMP, LCS, and character profile for a given player's stats.
        """
        # Default computation placeholders based on spec requirements
        erl = float(player_stats.get('erl', 75.0))
        dps = float(player_stats.get('dps', 65.0))
        cmp = float(player_stats.get('cmp', 80.0))
        lcs = float(player_stats.get('lcs', 70.0))

        # Determine character profile based on metrics
        avg_score = (erl + dps + cmp + lcs) / 4.0
        if avg_score >= 80:
            profile = "Elite Resilient Leader"
        elif avg_score >= 70:
            profile = "Steady Contributor"
        else:
            profile = "Developing Prospect"

        return {
            "ERL": round(erl, 2),
            "DPS": round(dps, 2),
            "CMP": round(cmp, 2),
            "LCS": round(lcs, 2),
            "character_profile": profile,
            "average_score": round(avg_score, 2)
        }

    def generate_mental_stats_json(self, players_data):
        """
        Generates full mental stats JSON for a whole match for all players.
        """
        results = {}
        for player_id, stats in players_data.items():
            results[player_id] = self.compute_metrics(stats)
        return json.dumps(results, indent=2, ensure_ascii=False)

    def generate_mental_stats_csv(self, players_data):
        """
        Generates full mental stats CSV for a whole match for all players.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["player_id", "ERL", "DPS", "CMP", "LCS", "character_profile", "average_score"])
        
        for player_id, stats in players_data.items():
            res = self.compute_metrics(stats)
            writer.writerow([
                player_id,
                res["ERL"],
                res["DPS"],
                res["CMP"],
                res["LCS"],
                res["character_profile"],
                res["average_score"]
            ])
            
        return output.getvalue()

if __name__ == "__main__":
    engine = MentalIndexEngine()
    sample_data = {
        "player_1": {"erl": 85, "dps": 78, "cmp": 82, "lcs": 80},
        "player_2": {"erl": 60, "dps": 65, "cmp": 70, "lcs": 68}
    }
    print(engine.generate_mental_stats_json(sample_data))
