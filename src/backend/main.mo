import Array "mo:core/Array";
import Time "mo:core/Time";
import Order "mo:core/Order";
import Int "mo:core/Int";
import List "mo:core/List";

actor {
  type ScoreEntry = {
    username : Text;
    score : Nat;
    timestamp : Time.Time;
  };

  module ScoreEntry {
    public func compare(a : ScoreEntry, b : ScoreEntry) : Order.Order {
      if (a.score > b.score) { return #less };
      if (a.score < b.score) { return #greater };
      switch (Int.compare(a.timestamp, b.timestamp)) {
        case (#equal) { a.username.compare(b.username) };
        case (order) { order };
      };
    };
  };

  let entries = List.empty<ScoreEntry>();

  public shared ({ caller }) func submitScore(username : Text, score : Nat) : async () {
    let newEntry : ScoreEntry = {
      username;
      score;
      timestamp = Time.now();
    };

    entries.add(newEntry);
  };

  public query ({ caller }) func getTopScores() : async [ScoreEntry] {
    let sorted = entries.toArray().sort();
    let takeAmount = if (sorted.size() < 10) { sorted.size() } else { 10 };
    Array.tabulate<ScoreEntry>(
      takeAmount,
      func(i) { sorted[i] },
    );
  };
};
